/* gestion.js — Gestión municipal ligera (06/10/2026)
   Sin servidor ni cuentas: los datos viven en el navegador (localStorage) y se
   sacan con Exportar CSV / GeoJSON. Se engancha a la ficha del muñeco y al mapa
   (window.mapaTerraPropio) sin modificar visor.js.
   v2: responsable, fecha límite con aviso de vencidos, historial automático,
   filtros por estado/tipo/prioridad y buscador. */
(function () {
  'use strict';

  var CLAVE = 'ghistora_gestion_ribera_v1';
  var CLAVE_EXPORT = 'ghistora_gestion_ribera_ultimo_export';
  var ESTADOS = ['Pendiente', 'En proceso', 'Resuelto'];
  var PRIORIDADES = ['Alta', 'Media', 'Baja'];
  var TIPOS = ['Parcela', 'Camino', 'Patrimonio', 'Inundación', 'Abandono agrícola', 'Erosión', 'Otro'];
  var RESPONSABLES = ['Alcaldía', 'Secretaría', 'Obras y servicios', 'Urbanismo', 'Medio ambiente', 'Guarda forestal'];
  var COLOR = { 'Pendiente': '#ff2d55', 'En proceso': '#ffd60a', 'Resuelto': '#30e36b' };
  var RGB = { 'Pendiente': '255,45,85', 'En proceso': '255,214,10', 'Resuelto': '48,227,107' };
  var TAM = { 'Alta': 28, 'Media': 22, 'Baja': 17 };

  /* ---------- utilidades ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function hoyISO() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fechaES(iso) { var p = String(iso).split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso; }
  function opciones(lista, actual) {
    return lista.map(function (o) { return '<option' + (o === actual ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('');
  }
  function opcionesCon(primera, lista, actual) {
    return '<option' + (primera === actual ? ' selected' : '') + '>' + esc(primera) + '</option>' + opciones(lista, actual);
  }
  function listaResp(id) {
    return '<datalist id="' + id + '">' + RESPONSABLES.map(function (r) { return '<option value="' + esc(r) + '">'; }).join('') + '</datalist>';
  }

  /* ---------- almacenamiento ---------- */
  var avisoStorage = false;
  function normalizar(i) {
    i.responsable = i.responsable || '';
    i.limite = i.limite || '';
    if (!Array.isArray(i.historial) || !i.historial.length) {
      i.historial = [{ f: i.fecha || hoyISO(), t: 'Creado como «' + (i.estado || 'Pendiente') + '»' }];
    }
    return i;
  }
  function cargar() {
    try { var d = JSON.parse(localStorage.getItem(CLAVE) || '[]'); return Array.isArray(d) ? d.map(normalizar) : []; }
    catch (e) { return []; }
  }
  function firma(it) {
    return JSON.stringify([it.tipo, it.estado, it.prioridad, it.responsable, it.limite, it.notas, it.lat, it.lon, it.historial.length]);
  }
  function enArchivo(it) { return it.expSig === firma(it); }
  function htmlInsignia(it) {
    return enArchivo(it)
      ? '<span class="g-sav g-sav-ok" data-sid="' + it.id + '" title="Incluido en el último archivo exportado">✔ En tu archivo</span>'
      : '<span class="g-sav g-sav-no" data-sid="' + it.id + '" title="Hay cambios o es nuevo: exporta para incluirlo en tu copia de seguridad">✖ Sin exportar</span>';
  }
  function refrescarInsignias() {
    var els = document.querySelectorAll('.g-sav');
    for (var k = 0; k < els.length; k++) {
      var id = parseInt(els[k].getAttribute('data-sid'), 10);
      var it = items.filter(function (x) { return x.id === id; })[0];
      if (it) els[k].outerHTML = htmlInsignia(it);
    }
  }
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(items)); }
    catch (e) {
      if (!avisoStorage) { avisoStorage = true; alert('No se pudo guardar en este navegador (¿modo privado o almacenamiento bloqueado?). Exporta tus datos para no perderlos.'); }
    }
    if (typeof document !== 'undefined' && document.querySelectorAll) refrescarInsignias();
  }
  var items = cargar();
  function siguienteId() { return items.reduce(function (m, i) { return Math.max(m, i.id); }, 0) + 1; }
  function anotar(it, texto) { it.historial.push({ f: hoyISO(), t: texto }); }
  function vencido(it) { return !!(it.limite && it.limite < hoyISO() && it.estado !== 'Resuelto'); }

  /* ---------- estilos ---------- */
  var st = document.createElement('style');
  st.textContent = [
    '#gestion-ficha { margin-top:14px; padding-top:12px; border-top:1px solid var(--border); }',
    '#gestion-ficha button, #panel-gestion button { background:var(--navy-light); color:var(--text-light); border:1px solid var(--border); border-radius:6px; padding:7px 12px; cursor:pointer; font-size:13px; }',
    '#gestion-ficha button:hover, #panel-gestion button:hover { border-color:var(--gold); }',
    '#gestion-ficha .g-primario, #panel-gestion .g-primario { background:var(--gold); color:#1a1a1a; border-color:var(--gold); font-weight:600; }',
    '#gestion-form { display:none; margin-top:10px; }',
    '#gestion-form label { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); margin:8px 0 3px; }',
    '#gestion-form select, #gestion-form textarea, #gestion-form input, #panel-gestion select, #panel-gestion textarea, #panel-gestion input[type=text], #panel-gestion input[type=date], #panel-gestion input[type=search] { width:100%; background:var(--navy-dark); color:var(--text-light); border:1px solid var(--border); border-radius:6px; padding:6px; font-size:13px; font-family:inherit; box-sizing:border-box; color-scheme:dark; }',
    '#gestion-msg { font-size:12px; color:var(--gold-bright); margin-top:8px; }',
    '#panel-gestion { overflow:auto; }',
    '.g-wrap { padding:24px; max-width:1000px; margin:0 auto; width:100%; box-sizing:border-box; }',
    '.g-wrap h2 { color:var(--gold-bright); margin:0 0 6px; }',
    '.g-sub { color:var(--text-muted); font-size:13px; margin-bottom:16px; }',
    '.g-cajas { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:12px; margin-bottom:16px; }',
    '.g-caja { background:var(--navy-light); border:1px solid var(--border); border-radius:8px; padding:12px; }',
    '.g-caja b { display:block; font-size:24px; color:var(--gold-bright); }',
    '.g-caja.g-roja b { color:#ff6b81; }',
    '.g-caja span { font-size:12px; color:var(--text-muted); }',
    '.g-barra { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:12px; }',
    '#panel-gestion .g-barra select { width:auto; }',
    '#panel-gestion .g-barra input[type=search] { flex:1; min-width:170px; width:auto; }',
    '.g-aviso { background:rgba(192,80,77,.18); border:1px solid #c0504d; border-radius:8px; padding:10px 12px; font-size:13px; margin-bottom:14px; }',
    '.g-item { background:var(--navy-light); border:1px solid var(--border); border-left:5px solid var(--gold); border-radius:8px; padding:12px 14px; margin-bottom:10px; }',
    '.g-item h4 { margin:0 0 4px; font-size:15px; color:var(--text-light); }',
    '.g-sav { display:inline-block; margin-left:8px; padding:1px 7px; border-radius:10px; font-size:10.5px; font-weight:600; vertical-align:middle; white-space:nowrap; }',
    '.g-sav-ok { background:#e3f8ea; color:#157a3a; border:1px solid #30e36b; }',
    '.g-sav-no { background:#ffe8ec; color:#c4112f; border:1px solid #ff2d55; }',
    '.g-venc { display:inline-block; margin-left:8px; padding:1px 8px; border-radius:10px; background:#ff2d55; color:#fff; font-size:11px; font-weight:600; vertical-align:middle; }',
    '.g-meta { font-size:12px; color:var(--text-muted); margin-bottom:6px; }',
    '.g-diag { font-size:12px; color:var(--text-muted); margin:6px 0; }',
    '.g-fila { display:flex; flex-wrap:wrap; gap:8px; margin:8px 0; }',
    '.g-fila > div { flex:1; min-width:130px; }',
    '.g-lab { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); margin-bottom:3px; }',
    '.g-hist summary { cursor:pointer; font-size:12.5px; color:var(--text-muted); padding:4px 0; }',
    '.g-hist ul { margin:4px 0 8px; padding-left:18px; font-size:12.5px; color:var(--text-light); }',
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
      pop.innerHTML = '<b>#' + it.id + ' · ' + esc(it.tipo) + '</b>' + (vencido(it) ? ' ⏰ <b>vencido</b>' : '') +
        '<br>' + esc(it.estado) + ' · prioridad ' + esc(it.prioridad) +
        (it.responsable ? '<br>Responsable: ' + esc(it.responsable) : '') +
        (it.limite ? '<br>Fecha límite: ' + esc(fechaES(it.limite)) : '') +
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
      '<label>Responsable (opcional)</label><input id="gf-resp" type="text" list="g-resp-lista-f" maxlength="60" placeholder="Quién se encarga">' + listaResp('g-resp-lista-f') +
      '<label>Fecha límite (opcional)</label><input id="gf-limite" type="date">' +
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
      var estado = document.getElementById('gf-estado').value;
      items.push(normalizar({
        id: siguienteId(), fecha: hoyISO(), lat: lat, lon: lon,
        refcat: cat.indexOf('(referencia catastral)') > -1 ? cat.replace(' (referencia catastral)', '') : '',
        tipo: document.getElementById('gf-tipo').value,
        prioridad: document.getElementById('gf-prio').value,
        estado: estado,
        responsable: document.getElementById('gf-resp').value.trim(),
        limite: document.getElementById('gf-limite').value,
        notas: document.getElementById('gf-notas').value.trim(),
        diagnostico: diag,
        historial: [{ f: hoyISO(), t: 'Creado como «' + estado + '»' }]
      }));
      guardar(); pintarMapa(); render();
      document.getElementById('gf-notas').value = '';
      document.getElementById('gf-resp').value = '';
      document.getElementById('gf-limite').value = '';
      document.getElementById('gestion-form').style.display = 'none';
      document.getElementById('gestion-msg').textContent = '✓ Añadido al seguimiento (#' + items[items.length - 1].id + '). Míralo en la pestaña Gestión municipal.';
    });
  }

  /* ---------- pestaña y panel ---------- */
  var panel, filtro = 'Todos', filtroTipo = 'Todos', filtroPrio = 'Todas', busqueda = '';
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
    panel.addEventListener('input', manejarInput);
  }

  function diasDesdeExport() {
    var t = null;
    try { t = localStorage.getItem(CLAVE_EXPORT); } catch (e) {}
    if (!t) return Infinity;
    return (Date.now() - new Date(t).getTime()) / 86400000;
  }

  function listaFiltrada() {
    var q = busqueda.trim().toLowerCase();
    return items.filter(function (i) {
      if (filtro !== 'Todos' && i.estado !== filtro) return false;
      if (filtroTipo !== 'Todos' && i.tipo !== filtroTipo) return false;
      if (filtroPrio !== 'Todas' && i.prioridad !== filtroPrio) return false;
      if (q) {
        var txt = [i.id, i.tipo, i.estado, i.prioridad, i.notas, i.responsable, i.refcat]
          .concat(Object.keys(i.diagnostico || {}).map(function (k) { return i.diagnostico[k]; }))
          .join(' ').toLowerCase();
        if (txt.indexOf(q) === -1) return false;
      }
      return true;
    }).sort(function (a, b) {
      return (vencido(b) ? 1 : 0) - (vencido(a) ? 1 : 0) ||
        PRIORIDADES.indexOf(a.prioridad) - PRIORIDADES.indexOf(b.prioridad) || b.id - a.id;
    });
  }

  function htmlLista() {
    var lista = listaFiltrada();
    var h = '<div class="g-sub">Mostrando ' + lista.length + ' de ' + items.length + '</div>';
    if (!lista.length) {
      return h + '<div class="g-vacio">' + (items.length ? 'Ningún registro coincide con los filtros o la búsqueda.' :
        'Aún no hay seguimientos. En «Mapa y Ficha técnica», suelta el muñeco en un punto y pulsa «Añadir a seguimiento».') + '</div>';
    }
    lista.forEach(function (it) {
      var diag = Object.keys(it.diagnostico || {}).map(function (k) { return '<b>' + esc(k) + ':</b> ' + esc(it.diagnostico[k]); }).join('<br>');
      var hist = it.historial.slice().reverse().map(function (h2) { return '<li>' + esc(fechaES(h2.f)) + ' — ' + esc(h2.t) + '</li>'; }).join('');
      h += '<div class="g-item" data-id="' + it.id + '" style="border-left-color:' + (COLOR[it.estado] || '#c9a65a') + '">' +
        '<h4>#' + it.id + ' · ' + esc(it.tipo) + (vencido(it) ? '<span class="g-venc">⏰ Vencido</span>' : '') + htmlInsignia(it) + '</h4>' +
        '<div class="g-meta">' + fechaES(it.fecha) + ' · ' + it.lat.toFixed(5) + ', ' + it.lon.toFixed(5) +
        (it.refcat ? ' · Ref. catastral ' + esc(it.refcat) : '') + '</div>' +
        (diag ? '<div class="g-diag">' + diag + '</div>' : '') +
        '<div class="g-fila"><div><label class="g-lab">Estado</label><select data-campo="estado">' + opciones(ESTADOS, it.estado) + '</select></div>' +
        '<div><label class="g-lab">Prioridad</label><select data-campo="prioridad">' + opciones(PRIORIDADES, it.prioridad) + '</select></div></div>' +
        '<div class="g-fila"><div><label class="g-lab">Responsable</label><input type="text" data-campo="responsable" list="g-resp-lista-p" maxlength="60" placeholder="Quién se encarga" value="' + esc(it.responsable) + '"></div>' +
        '<div><label class="g-lab">Fecha límite</label><input type="date" data-campo="limite" value="' + esc(it.limite) + '"></div></div>' +
        '<textarea data-campo="notas" rows="2" placeholder="Notas…">' + esc(it.notas) + '</textarea>' +
        '<details class="g-hist"><summary>🕓 Historial (' + it.historial.length + ')</summary><ul>' + hist + '</ul></details>' +
        '<div class="g-fila">' +
        (visibles[it.id] ? '<button data-accion="ver" class="g-primario">🙈 Ocultar del mapa</button>' : '<button data-accion="ver">📍 Ver en mapa</button>') +
        '<button data-accion="borrar">🗑️ Eliminar</button></div></div>';
    });
    return h;
  }

  function actualizarLista() {
    var c = document.getElementById('g-lista');
    if (c) c.innerHTML = htmlLista();
  }

  function render() {
    if (!panel) return;
    var cuenta = { 'Pendiente': 0, 'En proceso': 0, 'Resuelto': 0 };
    var nVenc = 0;
    items.forEach(function (i) { if (cuenta[i.estado] != null) cuenta[i.estado]++; if (vencido(i)) nVenc++; });

    var html = '<div class="g-wrap"><h2>🛠️ Gestión municipal</h2>' +
      '<div class="g-sub">Seguimiento ligero de incidencias, inspecciones y actuaciones. Los datos se guardan solo en este navegador: exporta una copia de vez en cuando.</div>';

    html += '<details class="g-ayuda"' + (items.length ? '' : ' open') + '><summary>❓ ¿Para qué sirve esto y para quién?</summary>' +
      '<h5>En una frase</h5>' +
      '<p>Es una <b>libreta de avisos pegada al mapa</b>: apuntas qué hay que revisar o arreglar, dónde está exactamente y en qué punto va, sin papeles sueltos ni hojas de cálculo.</p>' +
      '<h5>¿Para quién?</h5>' +
      '<ul><li>Alcaldía, concejales, técnicos y operarios de ayuntamientos pequeños que no tienen (ni pueden pagar) un programa de mapas profesional.</li>' +
      '<li>Cualquier persona que acompañe a un ayuntamiento rural y necesite llevar un control sencillo de lo pendiente.</li></ul>' +
      '<h5>Un ejemplo</h5>' +
      '<p>Un vecino avisa de que se ha desprendido el margen de un camino. En «Mapa y Ficha técnica» sueltas el muñeco en ese punto y pulsas <b>«Añadir a seguimiento»</b>. Eliges tipo «Camino», prioridad «Alta», quién se encarga («Obras y servicios») y una fecha límite, y escribes una nota. La ficha guarda automáticamente lo que el visor sabe de ese lugar (si es zona inundable, uso del suelo, referencia catastral…). Cuando se arregla, cambias el estado a «Resuelto».</p>' +
      '<h5>Cómo se sigue cada aviso</h5>' +
      '<ul><li>Puedes asignar un <b>responsable</b> y una <b>fecha límite</b>. Si la fecha pasa y el aviso no está resuelto, se marca en rojo como <b>«Vencido»</b> y sube al principio de la lista.</li>' +
      '<li>Cada cambio (de estado, prioridad, responsable, fecha o notas) queda anotado en el <b>historial</b> del aviso, con su fecha, para saber qué se hizo y cuándo.</li>' +
      '<li>Con los filtros y el buscador encuentras rápido lo que necesitas (por estado, tipo, prioridad o cualquier palabra: un nombre, una referencia catastral…).</li></ul>' +
      '<h5>Qué significan los puntos del mapa</h5>' +
      '<ul><li><span class="g-punto" style="background:' + COLOR['Pendiente'] + '"></span><b>Rojo parpadeante:</b> pendiente, nadie lo ha atendido todavía.</li>' +
      '<li><span class="g-punto" style="background:' + COLOR['En proceso'] + '"></span><b>Amarillo:</b> en proceso.</li>' +
      '<li><span class="g-punto" style="background:' + COLOR['Resuelto'] + '"></span><b>Verde:</b> resuelto.</li>' +
      '<li>Cuanto más grande es el punto, más prioridad tiene.</li>' +
      '<li>Los puntos <b>no se muestran solos</b>: aparecen en el mapa solo cuando pulsas «Ver en mapa» en un registro (o «Ver en mapa los de la lista»). Para quitarlos, pulsa «Ocultar del mapa», en el registro o dentro del propio punto, y el mapa vuelve a quedar limpio para consultar otras capas.</li></ul>' +
      '<h5>Importante saber</h5>' +
      '<ul><li>Los registros se guardan <b>solo en este navegador y este ordenador</b>. Si lo abres en otro equipo no los verás.</li>' +
      '<li>Para guardar una copia o compartirla usa <b>Exportar CSV</b> (se abre en Excel) o <b>Exportar GeoJSON</b> (se abre en programas de mapas como QGIS), y <b>Importar copia</b> para recuperarla.</li>' +
      '<li>Es una herramienta de apoyo para organizarse: <b>no sustituye</b> al registro oficial ni a los expedientes administrativos del ayuntamiento.</li></ul></details>';

    if (nVenc) {
      html += '<div class="g-aviso">⏰ Hay <b>' + nVenc + '</b> seguimiento' + (nVenc > 1 ? 's' : '') + ' con la fecha límite vencida y sin resolver.</div>';
    }
    if (items.length && diasDesdeExport() > 30) {
      html += '<div class="g-aviso">⚠️ Hace más de 30 días que no exportas una copia (o nunca lo has hecho). Pulsa Exportar para no perder tus registros si se borra el navegador.</div>';
    }
    html += '<div class="g-cajas">' +
      '<div class="g-caja"><b>' + cuenta['Pendiente'] + '</b><span>Pendientes</span></div>' +
      '<div class="g-caja"><b>' + cuenta['En proceso'] + '</b><span>En proceso</span></div>' +
      '<div class="g-caja"><b>' + cuenta['Resuelto'] + '</b><span>Resueltas</span></div>' +
      '<div class="g-caja' + (nVenc ? ' g-roja' : '') + '"><b>' + nVenc + '</b><span>Vencidas</span></div>' +
      '<div class="g-caja"><b>' + items.length + '</b><span>Total</span></div></div>';

    html += '<div class="g-barra">' +
      '<select data-accion="filtro-estado" title="Estado">' + opcionesCon('Todos', ESTADOS, filtro) + '</select>' +
      '<select data-accion="filtro-tipo" title="Tipo">' + opcionesCon('Todos', TIPOS, filtroTipo) + '</select>' +
      '<select data-accion="filtro-prio" title="Prioridad">' + opcionesCon('Todas', PRIORIDADES, filtroPrio) + '</select>' +
      '<input type="search" id="g-buscar" placeholder="🔎 Buscar (nota, responsable, ref. catastral…)" value="' + esc(busqueda) + '"></div>' +
      '<div class="g-barra">' +
      '<button data-accion="mostrar-todos">📍 Ver en mapa los de la lista</button>' +
      '<button data-accion="ocultar-todos">🙈 Ocultar todos</button>' +
      '<button data-accion="exp-csv">⬇️ Exportar CSV</button>' +
      '<button data-accion="exp-geo">⬇️ Exportar GeoJSON</button>' +
      '<button data-accion="informe">🖨️ Informe imprimible</button>' +
      '<button data-accion="imp">⬆️ Importar copia</button>' +
      '<input type="file" id="g-file" accept=".json,.geojson" style="display:none"></div>' +
      listaResp('g-resp-lista-p') +
      '<div id="g-lista">' + htmlLista() + '</div></div>';
    panel.innerHTML = html;
  }

  /* ---------- informe imprimible ---------- */
  function informe() {
    var lista = listaFiltrada();
    if (!lista.length) { alert('No hay seguimientos en la lista actual para imprimir. Ajusta los filtros o añade alguno.'); return; }
    var w = window.open('', '_blank');
    if (!w) { alert('El navegador ha bloqueado la ventana del informe. Permite las ventanas emergentes para este sitio y vuelve a pulsar el botón.'); return; }
    var cont = { 'Pendiente': 0, 'En proceso': 0, 'Resuelto': 0 }, venc = 0;
    lista.forEach(function (i) { cont[i.estado] = (cont[i.estado] || 0) + 1; if (vencido(i)) venc++; });
    var filtros = [];
    if (filtro !== 'Todos') filtros.push('estado: ' + filtro);
    if (filtroTipo !== 'Todos') filtros.push('tipo: ' + filtroTipo);
    if (filtroPrio !== 'Todas') filtros.push('prioridad: ' + filtroPrio);
    if (busqueda.trim()) filtros.push('búsqueda: «' + busqueda.trim() + '»');
    var TXT = { 'Pendiente': '#fff', 'En proceso': '#3a2e00', 'Resuelto': '#06391a' };
    var PRIC = { 'Alta': '#c4112f', 'Media': '#b8860b', 'Baja': '#4b7a5a' };
    var filas = lista.map(function (it) {
      var c = COLOR[it.estado] || '#999';
      var diag = Object.keys(it.diagnostico || {}).map(function (k) { return '<b>' + esc(k) + ':</b> ' + esc(it.diagnostico[k]); }).join('<br>');
      var hist = it.historial.map(function (h2) { return esc(fechaES(h2.f)) + ' — ' + esc(h2.t); }).join('<br>');
      return '<section class="it" style="border-left-color:' + c + '">' +
        '<h3><span class="dot" style="background:' + c + '"></span>#' + it.id + ' · ' + esc(it.tipo) +
        '<span class="pill" style="background:' + c + ';color:' + (TXT[it.estado] || '#fff') + '">' + esc(it.estado) + '</span>' +
        '<span class="pill pri" style="border-color:' + (PRIC[it.prioridad] || '#777') + ';color:' + (PRIC[it.prioridad] || '#555') + '">Prioridad ' + esc(it.prioridad) + '</span>' +
        (vencido(it) ? '<span class="pill venc">⏰ VENCIDO</span>' : '') + '</h3>' +
        '<table>' +
        '<tr><th>Responsable</th><td>' + (esc(it.responsable) || '—') + '</td><th>Fecha límite</th><td>' + (it.limite ? esc(fechaES(it.limite)) : '—') + '</td></tr>' +
        '<tr><th>Registrado</th><td>' + esc(fechaES(it.fecha)) + '</td><th>Ref. catastral</th><td>' + (esc(it.refcat) || '—') + '</td></tr>' +
        '<tr><th>Coordenadas</th><td colspan="3">' + it.lat.toFixed(5) + ', ' + it.lon.toFixed(5) + ' (WGS84)</td></tr>' +
        (it.notas ? '<tr><th>Notas</th><td colspan="3">' + esc(it.notas).replace(/\n/g, '<br>') + '</td></tr>' : '') +
        (diag ? '<tr><th>Datos del visor</th><td colspan="3" class="peq">' + diag + '</td></tr>' : '') +
        '<tr><th>Historial</th><td colspan="3" class="peq">' + hist + '</td></tr>' +
        '</table></section>';
    }).join('');
    var css = '*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
      'body{font:13px/1.45 Arial,Helvetica,sans-serif;color:#1a1a1a;margin:0;}' +
      '.cab{background:#1f2a24;color:#fff;padding:18px 28px 14px;border-bottom:5px solid #c9a65a;}' +
      '.cab h1{font-size:22px;margin:0 0 3px;letter-spacing:.3px;} .cab .sub{color:#d9d2bd;font-size:12px;} .cab .mun{color:#c9a65a;font-weight:bold;}' +
      '.cuerpo{padding:16px 28px 20px;}' +
      '.res{display:flex;gap:10px;margin:0 0 18px;flex-wrap:wrap;} .res div{flex:1;min-width:90px;border-radius:8px;padding:8px 10px;text-align:center;font-size:11.5px;} .res b{display:block;font-size:24px;line-height:1.1;}' +
      '.it{border:1px solid #cfcfcf;border-left:7px solid #999;border-radius:6px;padding:9px 12px;margin-bottom:11px;page-break-inside:avoid;}' +
      '.it h3{margin:0 0 7px;font-size:15px;} .dot{display:inline-block;width:14px;height:14px;border-radius:50%;margin-right:7px;vertical-align:-2px;box-shadow:0 0 0 2px #fff,0 0 0 3px #888;}' +
      '.pill{display:inline-block;margin-left:8px;padding:2px 10px;border-radius:11px;font-size:11.5px;font-weight:bold;vertical-align:1px;} .pri{background:#fff;border:1.5px solid;} .venc{background:#c4112f;color:#fff;}' +
      'table{width:100%;border-collapse:collapse;} th{width:16%;text-align:left;vertical-align:top;color:#666;font-weight:600;padding:2px 6px 2px 0;} td{padding:2px 8px 2px 0;vertical-align:top;} .peq{font-size:11.5px;color:#333;}' +
      '.pie{margin-top:16px;border-top:2px solid #c9a65a;padding-top:8px;font-size:11px;color:#555;}' +
      '.bar{background:#fff7dc;border-bottom:1px solid #e0cf99;padding:8px 28px;font-size:12px;} .bar button{font-size:14px;padding:6px 14px;cursor:pointer;margin-right:12px;} @media print{.bar{display:none;}} @page{margin:10mm;}';
    var hoy = fechaES(hoyISO());
    var caja = function (n, t, bg, fg) { return '<div style="background:' + bg + ';color:' + fg + '"><b>' + n + '</b>' + t + '</div>'; };
    var doc = '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Informe de seguimiento municipal — Ribera de Arriba — ' + hoy + '</title><style>' + css + '</style></head><body>' +
      '<div class="bar"><button onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>Consejo: en el cuadro de impresión, desmarca «Encabezados y pies de página» y marca «Gráficos de fondo» si aparece.</div>' +
      '<div class="cab"><h1>Informe de seguimiento municipal</h1>' +
      '<div class="sub"><span class="mun">Ribera de Arriba</span> · Generado el ' + hoy + ' desde el visor GHistora' + (filtros.length ? ' · Filtros aplicados: ' + esc(filtros.join(', ')) : '') + '</div></div>' +
      '<div class="cuerpo"><div class="res">' +
      caja(lista.length, 'seguimientos', '#1f2a24', '#fff') +
      caja(cont['Pendiente'], 'pendientes', COLOR['Pendiente'], '#fff') +
      caja(cont['En proceso'], 'en proceso', COLOR['En proceso'], '#3a2e00') +
      caja(cont['Resuelto'], 'resueltos', COLOR['Resuelto'], '#06391a') +
      caja(venc, 'vencidos', '#7a0c1f', '#fff') + '</div>' +
      filas +
      '<div class="pie">Documento de trabajo interno. Los datos de cada seguimiento los ha introducido la persona usuaria del visor; la información territorial procede de fuentes públicas (Catastro, SIOSE, SNCZI, espacios protegidos) y no tiene valor de certificación oficial.</div></div>' +
      '</body></html>';
    w.document.open(); w.document.write(doc); w.document.close();
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
    else if (acc === 'informe') informe();
    else if (acc === 'ocultar-todos') { visibles = {}; pintarMapa(); render(); }
    else if (acc === 'mostrar-todos') {
      var lista = listaFiltrada();
      if (!lista.length) return;
      lista.forEach(function (i) { visibles[i.id] = true; });
      pintarMapa(); render();
      var tabM = document.querySelector('.tab-btn[data-panel="panel-calle"]');
      if (tabM) tabM.click();
      var mapaT = getMapa();
      if (mapaT) setTimeout(function () {
        mapaT.invalidateSize();
        mapaT.fitBounds(lista.map(function (i) { return [i.lat, i.lon]; }), { maxZoom: 17, padding: [60, 60] });
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
    var acc = t.getAttribute('data-accion');
    if (acc === 'filtro-estado') { filtro = t.value; render(); return; }
    if (acc === 'filtro-tipo') { filtroTipo = t.value; render(); return; }
    if (acc === 'filtro-prio') { filtroPrio = t.value; render(); return; }
    if (t.id === 'g-file') { importar(t.files[0]); t.value = ''; return; }
    var campo = t.getAttribute('data-campo');
    if (!campo) return;
    var it = itemDe(t); if (!it) return;
    if (campo === 'estado' || campo === 'prioridad') {
      var antes = it[campo];
      if (antes === t.value) return;
      anotar(it, (campo === 'estado' ? 'Estado' : 'Prioridad') + ': ' + antes + ' → ' + t.value);
      it[campo] = t.value; guardar(); pintarMapa(); render();
    } else if (campo === 'responsable') {
      var v = t.value.trim();
      if (v === it.responsable) return;
      anotar(it, v ? 'Responsable: ' + v : 'Responsable quitado');
      it.responsable = v; guardar();
    } else if (campo === 'limite') {
      if (t.value === it.limite) return;
      anotar(it, t.value ? 'Fecha límite: ' + fechaES(t.value) : 'Fecha límite quitada');
      it.limite = t.value; guardar(); pintarMapa(); render();
    }
  }

  function manejarInput(e) {
    if (e.target.id === 'g-buscar') { busqueda = e.target.value; actualizarLista(); }
  }

  function manejarBlur(e) {
    var t = e.target;
    if (t.getAttribute && t.getAttribute('data-campo') === 'notas') {
      var it = itemDe(t); if (!it) return;
      var nueva = t.value.trim();
      if (it.notas !== nueva) { it.notas = nueva; anotar(it, 'Nota modificada'); guardar(); pintarMapa(); }
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
    items.forEach(function (x) { x.expSig = firma(x); });
    guardar();
    render();
  }
  function celda(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; }
  function exportarCSV() {
    var cab = ['id', 'fecha', 'tipo', 'estado', 'prioridad', 'responsable', 'fecha_limite', 'lat', 'lon', 'ref_catastral', 'notas', 'diagnostico', 'historial'];
    var filas = items.map(function (i) {
      var d = Object.keys(i.diagnostico || {}).map(function (k) { return k + ': ' + i.diagnostico[k]; }).join(' | ');
      var h = i.historial.map(function (x) { return fechaES(x.f) + ' ' + x.t; }).join(' | ');
      return [i.id, i.fecha, i.tipo, i.estado, i.prioridad, i.responsable, i.limite, i.lat, i.lon, i.refcat, i.notas, d, h].map(celda).join(';');
    });
    descargar('seguimiento_municipal_' + hoyISO() + '.csv', 'text/csv;charset=utf-8',
      '﻿' + cab.join(';') + '\r\n' + filas.join('\r\n'));
  }
  function exportarGeoJSON() {
    var fc = {
      type: 'FeatureCollection',
      features: items.map(function (i) {
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [i.lon, i.lat] },
          properties: { id: i.id, fecha: i.fecha, tipo: i.tipo, estado: i.estado, prioridad: i.prioridad,
            responsable: i.responsable, fecha_limite: i.limite,
            ref_catastral: i.refcat, notas: i.notas, diagnostico: i.diagnostico || {}, historial: i.historial }
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
          var hist = Array.isArray(p.historial) ? p.historial.filter(function (x) { return x && typeof x.f === 'string' && typeof x.t === 'string'; }) : [];
          items.push(normalizar({
            id: siguienteId(), fecha: p.fecha || hoyISO(), lat: c[1], lon: c[0],
            refcat: p.ref_catastral || '', tipo: TIPOS.indexOf(p.tipo) > -1 ? p.tipo : 'Otro',
            estado: ESTADOS.indexOf(p.estado) > -1 ? p.estado : 'Pendiente',
            prioridad: PRIORIDADES.indexOf(p.prioridad) > -1 ? p.prioridad : 'Media',
            responsable: String(p.responsable || ''), limite: /^\d{4}-\d{2}-\d{2}$/.test(p.fecha_limite || '') ? p.fecha_limite : '',
            notas: String(p.notas || ''), diagnostico: (p.diagnostico && typeof p.diagnostico === 'object') ? p.diagnostico : {},
            historial: hist
          }));
          items[items.length - 1].expSig = firma(items[items.length - 1]);
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
