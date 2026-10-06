/* gestion.js — Gestión municipal ligera (06/10/2026)
   Sin servidor ni cuentas: los datos viven en el navegador (localStorage) y se
   sacan con Exportar CSV / GeoJSON. Se engancha a la ficha del muñeco y al mapa
   (window.mapaTerraPropio) sin modificar visor.js. */
(function () {
  'use strict';

  var CLAVE = 'ghistora_gestion_ribera_v1';
  var CLAVE_EXPORT = 'ghistora_gestion_ribera_ultimo_export';
  var ESTADOS = ['Pendiente', 'En proceso', 'Resuelto'];
  var PRIORIDADES = ['Alta', 'Media', 'Baja'];
  var TIPOS = ['Parcela', 'Camino', 'Patrimonio', 'Inundación', 'Abandono agrícola', 'Erosión', 'Otro'];
  var COLOR = { 'Pendiente': '#ff2d55', 'En proceso': '#ffd60a', 'Resuelto': '#30e36b' };
  var RGB = { 'Pendiente': '255,45,85', 'En proceso': '255,214,10', 'Resuelto': '48,227,107' };
  var TAM = { 'Alta': 28, 'Media': 22, 'Baja': 17 };

  /* ---------- utilidades ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hoyISO() { return new Date().toISOString().slice(0, 10); }
  function fechaES(iso) { var p = String(iso).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; }
  function opciones(lista, actual) {
    return lista.map(function (o) { return '<option' + (o === actual ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('');
  }

  /* ---------- almacenamiento ---------- */
  var avisoStorage = false;
  function cargar() {
    try { var d = JSON.parse(localStorage.getItem(CLAVE) || '[]'); return Array.isArray(d) ? d : []; }
    catch (e) { return []; }
  }
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(items)); }
    catch (e) {
      if (!avisoStorage) { avisoStorage = true; alert('No se pudo guardar en este navegador (¿modo privado o almacenamiento bloqueado?). Exporta tus datos para no perderlos.'); }
    }
  }
  var items = cargar();
  function siguienteId() { return items.reduce(function (m, i) { return Math.max(m, i.id); }, 0) + 1; }

  /* ---------- estilos ---------- */
  var st = document.createElement('style');
  st.textContent = [
    '#gestion-ficha { margin-top:14px; padding-top:12px; border-top:1px solid var(--border); }',
    '#gestion-ficha button, #panel-gestion button { background:var(--navy-light); color:var(--text-light); border:1px solid var(--border); border-radius:6px; padding:7px 12px; cursor:pointer; font-size:13px; }',
    '#gestion-ficha button:hover, #panel-gestion button:hover { border-color:var(--gold); }',
    '#gestion-ficha .g-primario, #panel-gestion .g-primario { background:var(--gold); color:#1a1a1a; border-color:var(--gold); font-weight:600; }',
    '#gestion-form { display:none; margin-top:10px; }',
    '#gestion-form label { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); margin:8px 0 3px; }',
    '#gestion-form select, #gestion-form textarea, #panel-gestion select, #panel-gestion textarea { width:100%; background:var(--navy-dark); color:var(--text-light); border:1px solid var(--border); border-radius:6px; padding:6px; font-size:13px; font-family:inherit; box-sizing:border-box; }',
    '#gestion-msg { font-size:12px; color:var(--gold-bright); margin-top:8px; }',
    '#panel-gestion { overflow:auto; }',
    '.g-wrap { padding:24px; max-width:1000px; margin:0 auto; width:100%; box-sizing:border-box; }',
    '.g-wrap h2 { color:var(--gold-bright); margin:0 0 6px; }',
    '.g-sub { color:var(--text-muted); font-size:13px; margin-bottom:16px; }',
    '.g-cajas { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-bottom:16px; }',
    '.g-caja { background:var(--navy-light); border:1px solid var(--border); border-radius:8px; padding:12px; }',
    '.g-caja b { display:block; font-size:24px; color:var(--gold-bright); }',
    '.g-caja span { font-size:12px; color:var(--text-muted); }',
    '.g-barra { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:14px; }',
    '#panel-gestion .g-barra select { width:auto; }',
    '.g-aviso { background:rgba(192,80,77,.18); border:1px solid #c0504d; border-radius:8px; padding:10px 12px; font-size:13px; margin-bottom:14px; }',
    '.g-item { background:var(--navy-light); border:1px solid var(--border); border-left:5px solid var(--gold); border-radius:8px; padding:12px 14px; margin-bottom:10px; }',
    '.g-item h4 { margin:0 0 4px; font-size:15px; color:var(--text-light); }',
    '.g-meta { font-size:12px; color:var(--text-muted); margin-bottom:6px; }',
    '.g-diag { font-size:12px; color:var(--text-muted); margin:6px 0; }',
    '.g-fila { display:flex; flex-wrap:wrap; gap:8px; margin:8px 0; }',
    '.g-fila > div { flex:1; min-width:130px; }',
    '.g-vacio { color:var(--text-muted); font-size:14px; padding:20px 0; }',
    /* puntos del mapa: colores vivos con borde blanco y brillo; los pendientes laten y parpadean */
    '.g-pin-wrap { background:transparent !important; border:0 !important; }',
    '.g-pin { display:block; border-radius:50%; background:var(--c); border:3px solid #fff; box-sizing:border-box; box-shadow:0 0 12px 2px var(--c), 0 0 0 1px rgba(0,0,0,.6); }',
    '.g-pin.g-pend { animation:g-latido 1.2s ease-out infinite; }',
    '@keyframes g-latido {',
    '  0%   { box-shadow:0 0 0 0 rgba(var(--rgb),.95), 0 0 12px 2px var(--c), 0 0 0 1px rgba(0,0,0,.6); opacity:1; }',
    '  50%  { opacity:.45; }',
    '  70%  { box-shadow:0 0 0 22px rgba(var(--rgb),0), 0 0 12px 2px var(--c), 0 0 0 1px rgba(0,0,0,.6); opacity:1; }',
    '  100% { box-shadow:0 0 0 0 rgba(var(--rgb),0), 0 0 12px 2px var(--c), 0 0 0 1px rgba(0,0,0,.6); opacity:1; }',
    '}',
    '@media (prefers-reduced-motion: reduce) { .g-pin.g-pend { animation:none; } }',
    /* explicación para quien no conoce el tema */
    '.g-ayuda { background:var(--navy-dark); border:1px solid var(--border); border-radius:8px; padding:4px 14px; margin-bottom:16px; }',
    '.g-ayuda summary { cursor:pointer; padding:10px 0; font-weight:600; color:var(--gold-bright); }',
    '.g-ayuda p, .g-ayuda li { font-size:13.5px; line-height:1.55; color:var(--text-light); }',
    '.g-ayuda ul { padding-left:20px; margin:6px 0 10px; }',
    '.g-ayuda h5 { margin:12px 0 4px; font-size:13px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); }',
    '.g-punto { display:inline-block; width:12px; height:12px; border-radius:50%; border:2px solid #fff; vertical-align:middle; margin-right:6px; }'
  ].join('\n');
  document.head.appendChild(st);

  /* ---------- capa de puntos en el mapa ---------- */
  var capa = null;
  var visibles = {}; // ids de los seguimientos que se están mostrando en el mapa (por defecto, ninguno)
  function getMapa() { return window.mapaTerraPropio || null; }
  function ocultarDelMapa(id) { delete visibles[id]; pintarMapa(); render(); }
  function pintarMapa() {
    var mapa = getMapa();
    if (!mapa || typeof L === 'undefined') return;
    if (!capa) capa = L.layerGroup().addTo(mapa);
    capa.clearLayers();
    items.forEach(function (it) {
      if (!visibles[it.id]) return;
      var d = TAM[it.prioridad] || 22;
      var color = COLOR[it.estado] || '#ffd60a';
      var rgb = RGB[it.estado] || '255,214,10';
      var icono = L.divIcon({
        className: 'g-pin-wrap',
        html: '<span class="g-pin' + (it.estado === 'Pendiente' ? ' g-pend' : '') + '" style="--c:' + color + ';--rgb:' + rgb + ';width:' + d + 'px;height:' + d + 'px;"></span>',
        iconSize: [d, d], iconAnchor: [d / 2, d / 2], popupAnchor: [0, -d / 2]
      });
      var pop = document.createElement('div');
      pop.innerHTML = '<b>#' + it.id + ' · ' + esc(it.tipo) + '</b><br>' + esc(it.estado) + ' · prioridad ' + esc(it.prioridad) +
        (it.notas ? '<br>' + esc(it.notas) : '') +
        '<br><button type="button" class="g-pop-btn" style="margin-top:8px;padding:5px 10px;cursor:pointer;">🙈 Ocultar del mapa</button>';
      pop.querySelector('.g-pop-btn').addEventListener('click', function () { ocultarDelMapa(it.id); });
      L.marker([it.lat, it.lon], { icon: icono, zIndexOffset: 1000 })
        .bindPopup(pop).addTo(capa);
    });
  }

  /* ---------- bloque dentro de la ficha del muñeco ---------- */
  function valorFicha(id) {
    var e = document.getElementById(id);
    var t = e ? e.textContent.trim() : '';
    return /^(—|Consultando|Cargando|Pendiente de conectar)/.test(t) ? '' : t;
  }
  function montarFicha() {
    var res = document.getElementById('calle-resultado');
    if (!res || document.getElementById('gestion-ficha')) return;
    var b = document.createElement('div');
    b.id = 'gestion-ficha';
    b.innerHTML =
      '<button type="button" id="gestion-abrir" class="g-primario">➕ Añadir a seguimiento</button>' +
      '<div id="gestion-form">' +
      '<label>Tipo</label><select id="gf-tipo">' + opciones(TIPOS) + '</select>' +
      '<label>Prioridad</label><select id="gf-prio">' + opciones(PRIORIDADES, 'Media') + '</select>' +
      '<label>Estado</label><select id="gf-estado">' + opciones(ESTADOS) + '</select>' +
      '<label>Notas</label><textarea id="gf-notas" rows="3" placeholder="Qué hay que revisar, quién, cuándo…"></textarea>' +
      '<div style="margin-top:10px;display:flex;gap:8px;"><button type="button" id="gf-guardar" class="g-primario">Guardar</button><button type="button" id="gf-cancelar">Cancelar</button></div>' +
      '</div><div id="gestion-msg"></div>';
    res.appendChild(b);

    document.getElementById('gestion-abrir').addEventListener('click', function () {
      var c = document.getElementById('ficha-coords').textContent.split(',');
      if (c.length !== 2 || isNaN(parseFloat(c[0]))) { document.getElementById('gestion-msg').textContent = 'Suelta primero el muñeco en el mapa.'; return; }
      document.getElementById('gestion-form').style.display = 'block';
      document.getElementById('gestion-msg').textContent = '';
    });
    document.getElementById('gf-cancelar').addEventListener('click', function () {
      document.getElementById('gestion-form').style.display = 'none';
    });
    document.getElementById('gf-guardar').addEventListener('click', function () {
      var c = document.getElementById('ficha-coords').textContent.split(',');
      var lat = parseFloat(c[0]), lon = parseFloat(c[1]);
      if (isNaN(lat) || isNaN(lon)) return;
      var cat = valorFicha('ficha-catastro');
      var diag = {
        'Uso del suelo (SIOSE)': valorFicha('ficha-siose'),
        'Espacios protegidos': valorFicha('ficha-espacios'),
        'Inundación (SNCZI)': valorFicha('ficha-snczi'),
        'Cambio NBR': valorFicha('ficha-nbr'),
        'Elevación': valorFicha('ficha-elevacion')
      };
      Object.keys(diag).forEach(function (k) { if (!diag[k]) delete diag[k]; });
      items.push({
        id: siguienteId(), fecha: hoyISO(), lat: lat, lon: lon,
        refcat: cat.indexOf('(referencia catastral)') > -1 ? cat.replace(' (referencia catastral)', '') : '',
        tipo: document.getElementById('gf-tipo').value,
        prioridad: document.getElementById('gf-prio').value,
        estado: document.getElementById('gf-estado').value,
        notas: document.getElementById('gf-notas').value.trim(),
        diagnostico: diag
      });
      guardar(); pintarMapa(); render();
      document.getElementById('gf-notas').value = '';
      document.getElementById('gestion-form').style.display = 'none';
      document.getElementById('gestion-msg').textContent = '✓ Añadido al seguimiento (#' + items[items.length - 1].id + '). Míralo en la pestaña Gestión municipal.';
    });
  }

  /* ---------- pestaña y panel ---------- */
  var panel, filtro = 'Todos';
  function montarPanel() {
    var nav = document.querySelector('nav.tabs');
    var main = document.querySelector('main');
    if (!nav || !main) return;
    var btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.setAttribute('data-panel', 'panel-gestion');
    btn.textContent = '🛠️ Gestión municipal';
    nav.appendChild(btn);

    panel = document.createElement('div');
    panel.id = 'panel-gestion';
    panel.className = 'panel';
    main.appendChild(panel);

    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      panel.classList.add('active');
      render();
    });

    panel.addEventListener('click', manejarClick);
    panel.addEventListener('change', manejarChange);
    panel.addEventListener('focusout', manejarBlur);
  }

  function diasDesdeExport() {
    var t = null;
    try { t = localStorage.getItem(CLAVE_EXPORT); } catch (e) {}
    if (!t) return Infinity;
    return (Date.now() - new Date(t).getTime()) / 86400000;
  }

  function render() {
    if (!panel) return;
    var cuenta = { 'Pendiente': 0, 'En proceso': 0, 'Resuelto': 0 };
    items.forEach(function (i) { if (cuenta[i.estado] != null) cuenta[i.estado]++; });
    var lista = items.filter(function (i) { return filtro === 'Todos' || i.estado === filtro; })
      .sort(function (a, b) { return PRIORIDADES.indexOf(a.prioridad) - PRIORIDADES.indexOf(b.prioridad) || b.id - a.id; });

    var html = '<div class="g-wrap"><h2>🛠️ Gestión municipal</h2>' +
      '<div class="g-sub">Seguimiento ligero de incidencias, inspecciones y actuaciones. Los datos se guardan solo en este navegador: exporta una copia de vez en cuando.</div>';
    html += '<details class="g-ayuda"' + (items.length ? '' : ' open') + '><summary>❓ ¿Para qué sirve esto y para quién?</summary>' +
      '<h5>En una frase</h5>' +
      '<p>Es una <b>libreta de avisos pegada al mapa</b>: apuntas qué hay que revisar o arreglar, dónde está exactamente y en qué punto va, sin papeles sueltos ni hojas de cálculo.</p>' +
      '<h5>¿Para quién?</h5>' +
      '<ul><li>Alcaldía, concejales, técnicos y operarios de ayuntamientos pequeños que no tienen (ni pueden pagar) un programa de mapas profesional.</li>' +
      '<li>Cualquier persona que acompañe a un ayuntamiento rural y necesite llevar un control sencillo de lo pendiente.</li></ul>' +
      '<h5>Un ejemplo</h5>' +
      '<p>Un vecino avisa de que se ha desprendido el margen de un camino. En «Mapa y Ficha técnica» sueltas el muñeco en ese punto y pulsas <b>«Añadir a seguimiento»</b>. Eliges tipo «Camino», prioridad «Alta» y escribes una nota. El punto queda marcado en el mapa y la ficha guarda automáticamente lo que el visor sabe de ese lugar (si es zona inundable, uso del suelo, referencia catastral…). Cuando se arregla, cambias el estado a «Resuelto».</p>' +
      '<h5>Qué significan los puntos del mapa</h5>' +
      '<ul><li><span class="g-punto" style="background:' + COLOR['Pendiente'] + '"></span><b>Rojo parpadeante:</b> pendiente, nadie lo ha atendido todavía.</li>' +
      '<li><span class="g-punto" style="background:' + COLOR['En proceso'] + '"></span><b>Amarillo:</b> en proceso.</li>' +
      '<li><span class="g-punto" style="background:' + COLOR['Resuelto'] + '"></span><b>Verde:</b> resuelto.</li>' +
      '<li>Cuanto más grande es el punto, más prioridad tiene.</li>' +
      '<li>Los puntos <b>no se muestran solos</b>: aparecen en el mapa solo cuando pulsas «Ver en mapa» en un registro (o «Ver todos en mapa»). Para quitarlos, pulsa «Ocultar del mapa», en el registro o dentro del propio punto, y el mapa vuelve a quedar limpio para consultar otras capas.</li></ul>' +
      '<h5>Importante saber</h5>' +
      '<ul><li>Los registros se guardan <b>solo en este navegador y este ordenador</b>. Si lo abres en otro equipo no los verás.</li>' +
      '<li>Para guardar una copia o compartirla usa <b>Exportar CSV</b> (se abre en Excel) o <b>Exportar GeoJSON</b> (se abre en programas de mapas como QGIS), y <b>Importar copia</b> para recuperarla.</li>' +
      '<li>Es una herramienta de apoyo para organizarse: <b>no sustituye</b> al registro oficial ni a los expedientes administrativos del ayuntamiento.</li></ul></details>';
    if (items.length && diasDesdeExport() > 30) {
      html += '<div class="g-aviso">⚠️ Hace más de 30 días que no exportas una copia (o nunca lo has hecho). Pulsa Exportar para no perder tus registros si se borra el navegador.</div>';
    }
    html += '<div class="g-cajas">' +
      '<div class="g-caja"><b>' + cuenta['Pendiente'] + '</b><span>Pendientes</span></div>' +
      '<div class="g-caja"><b>' + cuenta['En proceso'] + '</b><span>En proceso</span></div>' +
      '<div class="g-caja"><b>' + cuenta['Resuelto'] + '</b><span>Resueltas</span></div>' +
      '<div class="g-caja"><b>' + items.length + '</b><span>Total</span></div></div>';
    html += '<div class="g-barra">' +
      '<select data-accion="filtro"><option>Todos</option>' + opciones(ESTADOS, filtro) + '</select>' +
      '<button data-accion="exp-csv">⬇️ Exportar CSV</button>' +
      '<button data-accion="exp-geo">⬇️ Exportar GeoJSON</button>' +
      '<button data-accion="mostrar-todos">📍 Ver todos en mapa</button>' +
      '<button data-accion="ocultar-todos">🙈 Ocultar todos</button>' +
      '<button data-accion="imp">⬆️ Importar copia</button>' +
      '<input type="file" id="g-file" accept=".json,.geojson" style="display:none"></div>';

    if (!lista.length) {
      html += '<div class="g-vacio">' + (items.length ? 'No hay registros con ese estado.' :
        'Aún no hay seguimientos. En «Mapa y Ficha técnica», suelta el muñeco en un punto y pulsa «Añadir a seguimiento».') + '</div>';
    }
    lista.forEach(function (it) {
      var diag = Object.keys(it.diagnostico || {}).map(function (k) { return '<b>' + esc(k) + ':</b> ' + esc(it.diagnostico[k]); }).join('<br>');
      html += '<div class="g-item" data-id="' + it.id + '" style="border-left-color:' + (COLOR[it.estado] || '#c9a65a') + '">' +
        '<h4>#' + it.id + ' · ' + esc(it.tipo) + '</h4>' +
        '<div class="g-meta">' + fechaES(it.fecha) + ' · ' + it.lat.toFixed(5) + ', ' + it.lon.toFixed(5) +
        (it.refcat ? ' · Ref. catastral ' + esc(it.refcat) : '') + '</div>' +
        (diag ? '<div class="g-diag">' + diag + '</div>' : '') +
        '<div class="g-fila"><div><select data-campo="estado">' + opciones(ESTADOS, it.estado) + '</select></div>' +
        '<div><select data-campo="prioridad">' + opciones(PRIORIDADES, it.prioridad) + '</select></div></div>' +
        '<textarea data-campo="notas" rows="2" placeholder="Notas…">' + esc(it.notas) + '</textarea>' +
        '<div class="g-fila">' +
        (visibles[it.id] ? '<button data-accion="ver" class="g-primario">🙈 Ocultar del mapa</button>' : '<button data-accion="ver">📍 Ver en mapa</button>') +
        '<button data-accion="borrar">🗑️ Eliminar</button></div></div>';
    });
    html += '</div>';
    panel.innerHTML = html;
  }

  function itemDe(el) {
    var c = el.closest('.g-item');
    if (!c) return null;
    var id = parseInt(c.getAttribute('data-id'), 10);
    return items.filter(function (i) { return i.id === id; })[0] || null;
  }

  function manejarClick(e) {
    var b = e.target.closest('button[data-accion]');
    if (!b) return;
    var acc = b.getAttribute('data-accion');
    if (acc === 'exp-csv') exportarCSV();
    else if (acc === 'exp-geo') exportarGeoJSON();
    else if (acc === 'imp') document.getElementById('g-file').click();
    else if (acc === 'ocultar-todos') { visibles = {}; pintarMapa(); render(); }
    else if (acc === 'mostrar-todos') {
      if (!items.length) return;
      items.forEach(function (i) { visibles[i.id] = true; });
      pintarMapa(); render();
      var tabM = document.querySelector('.tab-btn[data-panel="panel-calle"]');
      if (tabM) tabM.click();
      var mapaT = getMapa();
      if (mapaT) setTimeout(function () {
        mapaT.invalidateSize();
        mapaT.fitBounds(items.map(function (i) { return [i.lat, i.lon]; }), { maxZoom: 17, padding: [60, 60] });
      }, 150);
    }
    else if (acc === 'ver') {
      var it = itemDe(b); if (!it) return;
      if (visibles[it.id]) { ocultarDelMapa(it.id); return; }
      visibles[it.id] = true;
      pintarMapa(); render();
      var tabMapa = document.querySelector('.tab-btn[data-panel="panel-calle"]');
      if (tabMapa) tabMapa.click();
      var mapa = getMapa();
      if (mapa) setTimeout(function () { mapa.invalidateSize(); mapa.setView([it.lat, it.lon], 17); }, 150);
    } else if (acc === 'borrar') {
      var it2 = itemDe(b); if (!it2) return;
      if (confirm('¿Eliminar el seguimiento #' + it2.id + '? No se puede deshacer.')) {
        items = items.filter(function (i) { return i.id !== it2.id; });
        delete visibles[it2.id];
        guardar(); pintarMapa(); render();
      }
    }
  }
  function manejarChange(e) {
    var t = e.target;
    if (t.getAttribute('data-accion') === 'filtro') { filtro = t.value; render(); return; }
    if (t.id === 'g-file') { importar(t.files[0]); t.value = ''; return; }
    var campo = t.getAttribute('data-campo');
    if (campo === 'estado' || campo === 'prioridad') {
      var it = itemDe(t); if (!it) return;
      it[campo] = t.value; guardar(); pintarMapa(); render();
    }
  }
  function manejarBlur(e) {
    var t = e.target;
    if (t.getAttribute && t.getAttribute('data-campo') === 'notas') {
      var it = itemDe(t); if (!it) return;
      if (it.notas !== t.value.trim()) { it.notas = t.value.trim(); guardar(); pintarMapa(); }
    }
  }

  /* ---------- exportar / importar ---------- */
  function descargar(nombre, tipo, contenido) {
    var blob = new Blob([contenido], { type: tipo });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = nombre;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    try { localStorage.setItem(CLAVE_EXPORT, new Date().toISOString()); } catch (e) {}
    render();
  }
  function celda(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function exportarCSV() {
    var cab = ['id', 'fecha', 'tipo', 'estado', 'prioridad', 'lat', 'lon', 'ref_catastral', 'notas', 'diagnostico'];
    var filas = items.map(function (i) {
      var d = Object.keys(i.diagnostico || {}).map(function (k) { return k + ': ' + i.diagnostico[k]; }).join(' | ');
      return [i.id, i.fecha, i.tipo, i.estado, i.prioridad, i.lat, i.lon, i.refcat, i.notas, d].map(celda).join(';');
    });
    descargar('seguimiento_municipal_' + hoyISO() + '.csv', 'text/csv;charset=utf-8',
      '\uFEFF' + cab.join(';') + '\r\n' + filas.join('\r\n'));
  }
  function exportarGeoJSON() {
    var fc = {
      type: 'FeatureCollection',
      features: items.map(function (i) {
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [i.lon, i.lat] },
          properties: { id: i.id, fecha: i.fecha, tipo: i.tipo, estado: i.estado, prioridad: i.prioridad,
            ref_catastral: i.refcat, notas: i.notas, diagnostico: i.diagnostico || {} }
        };
      })
    };
    descargar('seguimiento_municipal_' + hoyISO() + '.geojson', 'application/geo+json', JSON.stringify(fc, null, 2));
  }
  function importar(archivo) {
    if (!archivo) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var fc = JSON.parse(r.result);
        var feats = (fc && fc.features) || [];
        var n = 0;
        feats.forEach(function (f) {
          if (!f.geometry || f.geometry.type !== 'Point') return;
          var p = f.properties || {}, c = f.geometry.coordinates;
          if (typeof c[0] !== 'number' || typeof c[1] !== 'number') return;
          items.push({
            id: siguienteId(), fecha: p.fecha || hoyISO(), lat: c[1], lon: c[0],
            refcat: p.ref_catastral || '', tipo: TIPOS.indexOf(p.tipo) > -1 ? p.tipo : 'Otro',
            estado: ESTADOS.indexOf(p.estado) > -1 ? p.estado : 'Pendiente',
            prioridad: PRIORIDADES.indexOf(p.prioridad) > -1 ? p.prioridad : 'Media',
            notas: String(p.notas || ''), diagnostico: (p.diagnostico && typeof p.diagnostico === 'object') ? p.diagnostico : {}
          });
          n++;
        });
        guardar(); pintarMapa(); render();
        alert('Importados ' + n + ' registros (se han añadido a los existentes con id nuevo).');
      } catch (err) { alert('No se pudo leer el archivo: no parece un GeoJSON exportado desde este visor.'); }
    };
    r.readAsText(archivo);
  }

  /* ---------- arranque ---------- */
  function iniciar() {
    montarFicha();
    montarPanel();
    var intentos = 0;
    (function esperarMapa() {
      if (getMapa()) { pintarMapa(); return; }
      if (++intentos < 40) setTimeout(esperarMapa, 250);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
