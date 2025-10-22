
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

    
    // L.control.layers(baseLayers, overlays).addTo(map);

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
        // async function loadRaster() {
        //     const res = await fetch("data/NTL.tif");
        //     const arrayBuffer = await res.arrayBuffer();
        //     const georaster = await parseGeoraster(arrayBuffer);
        //     const rasterLayer = new GeoRasterLayer({
        //         georaster: georaster,
        //         pane: "rasterPane",
        //         opacity: 1,
        //         resolution: 256,
        //         pixelValuesToColorFn: value => getNightLightsColor(value),
        //     }).addTo(map);

        //     rasterLayer.addTo(map);
        // }

        // function getNightLightsColor(value) {
        //     if (value <= 0) return null;
        //     const min = 0, max = 15; // sesuaikan dengan nilai GeoTIFF Anda
        //     const ratio = Math.min((value - min) / (max - min), 1);

        //     // Warna awal (#ff7f00) → Warna akhir (#e4ff1c)
        //     const start = { r: 255, g: 127, b: 0 };     // #ff7f00
        //     const end   = { r: 228, g: 255, b: 28 };    // #e4ff1c

        //     // Interpolasi linear antar warna
        //     const r = Math.floor(start.r + (end.r - start.r) * ratio);
        //     const g = Math.floor(start.g + (end.g - start.g) * ratio);
        //     const b = Math.floor(start.b + (end.b - start.b) * ratio);

        //     // Opsi transparansi lembut (semakin besar nilai, semakin kuat)
        //     const alpha = 0.3 + 0.7 * ratio;

        //     return `rgba(${r},${g},${b},${alpha})`;
        // }


        const imageBounds = [
        [-11.0083334214, 94.9708340931],
        [6.0791667153, 141.0208344615]
        ];
        L.imageOverlay("data/NightTimeLight_1.png", imageBounds).addTo(map);
        map.fitBounds(imageBounds);


        // === LEGENDA UNTUK GEOTIFF ===
        // === LEGENDA UNTUK GEOTIFF ===
        const legendNTL = L.control({ position: "bottomright" });

        legendNTL.onAdd = function (map) {
          const div = L.DomUtil.create("div", "legend");
          div.innerHTML = `
              <h4>Kecerahan NTL</h4>
              <p>(x 10⁻¹ nWatts/cm²/sr)</p>
              <div class="gradient-bar"></div>
              <div class="legend-labels">
              <span>0</span>
              <span>>15</span>
              </div>
          `;
          return div;
        };

        legendNTL.addTo(map);



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
            const mergedProps = {};

            for (const code of codes) {
                const prov = await fetchProvGeoJSON(code);
                if (!prov) continue;

                let target = code;
                for (const key in mergeProvCodes) {
                    if (mergeProvCodes[key].includes(code)) target = parseInt(key);
                }

                // Tangkap properti target (sekali saja)
                if (!mergedProps[target]) {
                    const f = prov.geo.features[0];
                    mergedProps[target] = {
                        ...f.properties,
                        Code: target,
                        Name: f.properties.Name // default, nanti bisa ditimpa
                    };
                }

                prov.geo.features.forEach(f => {
                    if (!merged[target]) merged[target] = f;
                    else merged[target] = turf.union(merged[target], f);
                });
            }

            // Setelah semua digabung, timpa properties agar sesuai target
            const mergedFeatures = Object.entries(merged).map(([code, feature]) => {
                const props = mergedProps[code];
                feature.properties = { ...feature.properties, ...props };
                return {
                    code: parseInt(code),
                    geo: { type: "FeatureCollection", features: [feature] }
                };
            });

            // 🔧 Update cacheProv agar layer lain (choropleth, tooltip, dll) ikut pakai hasil gabungan
        // 🔧 Kosongkan isi cacheProv tanpa ganti referensinya
        Object.keys(cacheProv).forEach(k => delete cacheProv[k]);
        mergedFeatures.forEach(f => {
            cacheProv[f.code] = f;
        });


            return mergedFeatures;
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
                            l.on("mouseover", () => l.setStyle({ color: "blue", weight: 3 }));
                            l.on("mouseout", () => l.setStyle({ color: "#ff6600", weight: 1 }));
                            
                            // Circle Marker
                            // === Tambahkan Circle Marker di pinggir polygon ===
                            if (kabCsvData && kabCsvData["Jumlah BPR/BPRS"] != null) {
                                const bounds = l.getBounds();
                                const center = bounds.getCenter();

                                // Geser posisi ke arah timur laut (lat +, lng +)
                                const offsetLat = (bounds.getNorth() - bounds.getSouth()) * 0.2; // 10% dari tinggi polygon
                                const offsetLng = (bounds.getEast() - bounds.getWest()) * 0.2;   // 10% dari lebar polygon

                                const adjustedLat = center.lat + offsetLat;
                                const adjustedLng = center.lng + offsetLng;
                                const adjustedPoint = L.latLng(adjustedLat, adjustedLng);

                                const radius = Math.sqrt(kabCsvData["Jumlah BPR/BPRS"]) * 10; // skala agar tidak terlalu besar

                                L.circleMarker(adjustedPoint, {
                                    radius: radius,
                                    fillColor: "blue",
                                    color: "blue",
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
    // await loadRaster();

    await loadCSVToMap("data/data_SEM.csv", "idProv", provDataMap);   // CSV provinsi
    await loadCSVToMap("data/BPR_Sumut.csv", "idKab", kabDataMap);    // CSV kabupaten

    const mergedProv = await mergeProvincesUnion(provCodes);
    mergedProv.forEach(addProvinceLayer);

    hideLoading();


    // === Buat Choropleth berdasarkan kolom-kolom di data_SEM.csv ===
    const semChoroplethLayers = {}; // wadah choropleth per kolom

  const colorPalettes = [
    ["#e4ff1c", "#ff7f00"],  // kuning → oranye
    ["#66ffcc", "#0066ff"],  // hijau muda → biru
    ["#ff80ff", "#9b00ff"],  // pink → ungu
    ["#ccff66", "#00cc00"],  // limau → hijau
    ["#ffff66", "#ff0000"],  // kuning pucat → merah
    ["#99ffff", "#0099cc"],  // cyan muda → biru laut
    ["#ffcccc", "#ff3399"],  // pink muda → magenta
    ["#ffff99", "#996600"],  // krem → coklat
    ["#cc99ff", "#6600cc"],  // lavender → ungu tua
    ["#aaffaa", "#008080"],  // hijau pastel → teal
  ];


    // Helper untuk interpolasi dua warna hex
  function interpolateColor(hex1, hex2, ratio) {
      const r1 = parseInt(hex1.substring(1, 3), 16);
      const g1 = parseInt(hex1.substring(3, 5), 16);
      const b1 = parseInt(hex1.substring(5, 7), 16);
      const r2 = parseInt(hex2.substring(1, 3), 16);
      const g2 = parseInt(hex2.substring(3, 5), 16);
      const b2 = parseInt(hex2.substring(5, 7), 16);

      const r = Math.round(r1 + (r2 - r1) * ratio);
      const g = Math.round(g1 + (g2 - g1) * ratio);
      const b = Math.round(b1 + (b2 - b1) * ratio);
      return `rgb(${r},${g},${b})`;
  }

    // === Legenda Dinamis ===
    // === LEGENDA DINAMIS UNTUK CHOROPLETH ===
    let legendChoropleth = L.control({ position: "bottomright" });

    const legendContainer = L.DomUtil.create("div", "legend-container");
    legendContainer.style.display = "flex";
    legendContainer.style.flexDirection = "column"; // atau row jika mau horizontal
    legendContainer.style.alignItems = "flex-start"; 


    const legendChoroplethDiv = L.DomUtil.create("div", "legendChoropleth");

    legendContainer.appendChild(legendChoroplethDiv);

    // Inline CSS background style
    legendChoroplethDiv.style.background = "rgba(255, 255, 255, 0.9)";
    legendChoroplethDiv.style.padding = "10px 12px";
    legendChoroplethDiv.style.borderRadius = "8px";
    legendChoroplethDiv.style.boxShadow = "0 0 8px rgba(0, 0, 0, 0.2)";
    legendChoroplethDiv.style.fontSize = "13px";
    legendChoroplethDiv.style.lineHeight = "1.4";
    legendChoroplethDiv.style.color = "#333";
    legendChoroplethDiv.style.maxWidth = "180px"; // opsional, biar rapi
    legendChoroplethDiv.style.backdropFilter = "blur(3px)"; // opsional, efek kaca buram

    const legendWrapper = L.control({ position: "bottomright" });
    legendWrapper.onAdd = function() {
        return legendContainer;
    };
    legendWrapper.addTo(map);



    legendChoropleth.update = function(props) {
      if (!props) {
          legendChoroplethDiv.innerHTML = "";
          return;
      }
      const { title, colorStart, colorEnd, min, max } = props;
      const steps = 6;
      const grades = [];
      for (let i = 0; i <= steps; i++) grades.push(min + (i * (max - min)) / steps);

      let html = `<strong>${title}</strong><br>`;
      for (let i = 0; i < grades.length - 1; i++) {
          const c = interpolateColor(colorStart, colorEnd, (i / (steps - 1)));
          html += `<i style="background:${c};width:20px;height:10px;display:inline-block;margin-right:6px;"></i> 
                  ${grades[i].toFixed(2)}–${grades[i + 1].toFixed(2)}<br>`;
      }
      legendChoroplethDiv.innerHTML = html;
    };


    function showLegend(title, colorStart, colorEnd, min, max) {
        legendChoropleth.update({ title, colorStart, colorEnd, min, max });
    }

    function hideLegend() {
        legendChoropleth.update(null); // kosongkan konten
    }



    // === Fungsi Choropleth ===
    function createChoroplethLayer(columnName, colorStart, colorEnd) {
        const values = Object.values(provDataMap)
            .map(d => parseFloat(d[columnName]))
            .filter(v => !isNaN(v));

        if (values.length === 0) return null;

        const min = Math.min(...values);
        const max = Math.max(...values);

        const getColor = v => interpolateColor(colorStart, colorEnd, (v - min) / (max - min));

        const layer = L.geoJSON(
            Object.values(cacheProv)
                .map(p => p.geo)
                .reduce((acc, geo) => acc.concat(geo.features), []),
            {
                style: feature => {
                    const code = feature.properties.Code;
                    const row = provDataMap[code];
                    const value = row ? parseFloat(row[columnName]) : null;
                    return {
                        fillColor: value != null ? getColor(value) : "#ccc",
                        color: "white",
                        weight: 1,
                        fillOpacity: 0.9
                    };
                },
                onEachFeature: (feature, layer) => {
                    const code = feature.properties.Code;
                    const row = provDataMap[code];
                    const value = row ? row[columnName] : "N/A";
                    layer.bindTooltip(`${feature.properties.Name}<br>${columnName}: ${value}`, {
                        direction: "top",
                        offset: [0, -4],
                        className: "prov-tooltip"
                    });
                }
            }
        );

        // Tambah event untuk kontrol legendanya
        map.on("overlayadd", e => {
            if (e.name === `Choropleth: ${columnName}`) {
                showLegend(columnName, colorStart, colorEnd, min, max);
            }
        });

        map.on("overlayremove", e => {
            if (e.name === `Choropleth: ${columnName}`) {
                hideLegend();
            }
        });

        return layer;
    }

    // Ambil kolom numerik dan buat choropleth-nya
    const sampleRow = Object.values(provDataMap)[0];
    if (sampleRow) {
        const columns = Object.keys(sampleRow).filter(k =>
            !["idProv", "Nama_Prov"].includes(k)
        );

        columns.forEach((col, i) => {
            const [start, end] = colorPalettes[i % colorPalettes.length];
            const layer = createChoroplethLayer(col, start, end);
            if (layer) {
                semChoroplethLayers[`Choropleth: ${col}`] = layer;
                overlays[`Choropleth: ${col}`] = layer;
            }
        });
    }

    // Perbarui kontrol layer agar menampilkan daftar choropleth
    L.control.layers(baseLayers, overlays, { collapsed: true }).addTo(map);
    

})();
