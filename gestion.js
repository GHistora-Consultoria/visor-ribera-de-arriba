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
    if (!Array.isArray(i.fotos)) i.fotos = [];
    if (i.forma) {
      var fm = i.forma, ok = fm && (fm.tipo === 'linea' || fm.tipo === 'zona') && Array.isArray(fm.pts) && fm.pts.length >= (fm.tipo === 'zona' ? 3 : 2);
      if (ok) {
        fm.pts = fm.pts.filter(function (p) { return Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number'; });
        ok = fm.pts.length >= (fm.tipo === 'zona' ? 3 : 2);
      }
      if (!ok) delete i.forma;
    }
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
    return JSON.stringify([it.tipo, it.estado, it.prioridad, it.responsable, it.limite, it.notas, it.lat, it.lon, it.historial.length, it.forma || null]);
  }
  function enArchivo(it) { return it.expSig === firma(it); }
  function idsFotos(it) { return (it.fotos || []).map(function (f) { return f.id; }).join(','); }
  function htmlInsignia(it) {
    if (enArchivo(it) && it.fotos.length && it.expFotos !== idsFotos(it)) {
      return '<span class="g-sav g-sav-fo" data-sid="' + it.id + '" title="Los datos están en tu archivo, pero las fotos no van en el CSV ni en el GeoJSON. Usa «Copia completa con fotos».">⚠ Fotos sin copia</span>';
    }
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
    '.g-sav-fo { background:#fff3d6; color:#8a5a00; border:1px solid #ffb300; }',
    '.g-fotos { margin:8px 0; }',
    '.g-fotos-fila { display:flex; flex-wrap:wrap; align-items:center; }',
    '.g-foto { position:relative; display:inline-block; margin:0 10px 8px 0; }',
    '#panel-gestion button.g-foto-img { padding:0; width:92px; height:92px; overflow:hidden; border-radius:6px; border:2px solid var(--border); background:var(--navy-dark); color:var(--text-muted); font-size:11px; }',
    '.g-foto-img img { width:100%; height:100%; object-fit:cover; display:block; }',
    '#panel-gestion button.g-foto-x { position:absolute; top:-7px; right:-7px; width:24px; height:24px; padding:0; border-radius:50%; background:#c4112f; color:#fff; border:2px solid #fff; font-size:11px; line-height:1; }',
    '.g-fotobtn { display:inline-block; padding:7px 12px; border:1px dashed var(--gold); border-radius:6px; cursor:pointer; font-size:13px; color:var(--gold-bright); margin:0 0 8px; }',
    '.g-visor-foto { position:fixed; inset:0; background:rgba(0,0,0,.88); z-index:100000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px; }',
    '.g-visor-foto img { max-width:96vw; max-height:80vh; border-radius:6px; background:#000; }',
    '.g-visor-foto .g-vf-bt { margin-top:12px; display:flex; gap:10px; }',
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
    '.g-sug { background:var(--navy-dark); border:1px solid var(--border); border-left:5px solid #9575cd; border-radius:8px; padding:4px 14px; margin-bottom:16px; }',
    '.g-sug > summary { cursor:pointer; padding:10px 0; font-weight:600; color:var(--gold-bright); }',
    '.g-sug p { font-size:13px; line-height:1.5; color:var(--text-light); margin:4px 0 10px; }',
    '.g-sug-it { border-top:1px solid var(--border); padding:10px 0; }',
    '.g-sug-it b { color:var(--text-light); }',
    '.g-sug-mot { display:block; font-size:12.5px; color:var(--text-muted); margin:3px 0 7px; }',
    '.g-sug-pri { display:inline-block; margin-left:8px; padding:1px 8px; border-radius:10px; font-size:11px; font-weight:600; color:#fff; vertical-align:middle; }',
    '.g-sug-bt button { margin:0 6px 6px 0; }',
    '.g-pagin { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin:8px 0; font-size:13px; color:var(--text-muted); }',
    '#panel-gestion .g-pagin button:disabled { opacity:.35; cursor:default; border-color:var(--border); }',
    '.g-modal { position:fixed; inset:0; background:rgba(0,0,0,.65); z-index:100000; display:flex; align-items:center; justify-content:center; padding:14px; }',
    '.g-modal-c { background:#1f2a24; color:#fff; border:2px solid #c9a65a; border-radius:12px; padding:16px 18px; width:100%; max-width:420px; max-height:92vh; overflow:auto; box-sizing:border-box; }',
    '.g-modal-c h4 { margin:0 0 6px; color:#ffc15a; font-size:17px; }',
    '.g-modal-med { color:#e8e2cf; font-size:13px; margin-bottom:6px; }',
    '.g-modal-c label { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#b9b39e; margin:9px 0 3px; }',
    '.g-modal-c select, .g-modal-c input, .g-modal-c textarea { width:100%; background:#12201a; color:#fff; border:1px solid #6b6b5a; border-radius:6px; padding:7px; font-size:14px; font-family:inherit; box-sizing:border-box; color-scheme:dark; }',
    '.g-modal-bt { display:flex; gap:8px; margin-top:14px; flex-wrap:wrap; }',
    '.g-modal-bt button { background:#2d3b33; color:#fff; border:1px solid #888; border-radius:6px; padding:8px 14px; cursor:pointer; font-size:14px; }',
    '.g-modal-bt button.g-primario { background:#c9a65a; color:#1a1a1a; border-color:#c9a65a; font-weight:600; }',
    '.g-forma { font-size:13px; color:var(--gold-bright); margin:4px 0 6px; font-weight:600; }',
    '.g-dib-barra { position:absolute; top:10px; left:64px; right:10px; max-width:430px; z-index:1000; background:rgba(31,42,36,.94); color:#fff; border:2px solid #ff9f0a; border-radius:10px; padding:8px 12px; box-shadow:0 4px 16px rgba(0,0,0,.5); font-size:12.5px; }',
    '.g-dib-tit { font-weight:700; color:#ffc15a; margin-bottom:3px; }',
    '.g-dib-ayu { color:#e8e2cf; margin-bottom:4px; }',
    '.g-dib-info { font-weight:600; margin-bottom:6px; }',
    '.g-dib-bt { display:flex; gap:8px; flex-wrap:wrap; }',
    '.g-dib-bt button { background:#2d3b33; color:#fff; border:1px solid #888; border-radius:6px; padding:6px 10px; cursor:pointer; font-size:12.5px; }',
    '.g-dib-bt button.g-primario { background:#c9a65a; color:#1a1a1a; border-color:#c9a65a; font-weight:600; }',
    '.g-dib-bt button:disabled { opacity:.4; cursor:default; }',
    '.g-punto { display:inline-block; width:12px; height:12px; border-radius:50%; border:2px solid #fff; vertical-align:middle; margin-right:6px; }'
  ].join('\n');
  document.head.appendChild(st);

  /* ---------- líneas y zonas dibujadas ---------- */
  function distM(a, b) {
    var R = 6371008.8, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
    var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function longitudM(pts, cerrar) {
    var t = 0;
    for (var k = 1; k < pts.length; k++) t += distM(pts[k - 1], pts[k]);
    if (cerrar && pts.length > 2) t += distM(pts[pts.length - 1], pts[0]);
    return t;
  }
  function areaM2(pts) {
    if (pts.length < 3) return 0;
    var r = Math.PI / 180, R = 6371008.8, la0 = 0;
    pts.forEach(function (p) { la0 += p[0]; }); la0 /= pts.length;
    var xy = pts.map(function (p) { return [p[1] * r * R * Math.cos(la0 * r), p[0] * r * R]; });
    var a = 0;
    for (var k = 0; k < xy.length; k++) { var q = xy[(k + 1) % xy.length]; a += xy[k][0] * q[1] - q[0] * xy[k][1]; }
    return Math.abs(a) / 2;
  }
  function numES(n, dec) { return n.toLocaleString('es-ES', { maximumFractionDigits: dec == null ? 0 : dec, minimumFractionDigits: 0 }); }
  function medidaForma(f) {
    if (!f) return '';
    if (f.tipo === 'linea') { var m = longitudM(f.pts, false); return 'Línea de ' + numES(m) + ' m'; }
    var a = areaM2(f.pts);
    return 'Zona de ' + numES(a) + ' m² (' + numES(a / 10000, 2) + ' ha) · perímetro ' + numES(longitudM(f.pts, true)) + ' m';
  }
  function centroidePts(pts) {
    var la = 0, lo = 0;
    pts.forEach(function (p) { la += p[0]; lo += p[1]; });
    return [la / pts.length, lo / pts.length];
  }

  /* ---------- capa de puntos en el mapa ---------- */
  var capa = null;
  var visibles = {}; // ids de los seguimientos que se están mostrando en el mapa (por defecto, ninguno)
  function getMapa() { return window.mapaTerraPropio || null; }
  function ocultarDelMapa(id) { delete visibles[id]; pintarMapa(); render(); }

  function popupDe(it) {
    var pop = document.createElement('div');
    pop.innerHTML = '<b>#' + it.id + ' · ' + esc(it.tipo) + '</b>' + (vencido(it) ? ' ⏰ <b>vencido</b>' : '') +
      '<br>' + esc(it.estado) + ' · prioridad ' + esc(it.prioridad) +
      (it.responsable ? '<br>Responsable: ' + esc(it.responsable) : '') +
      (it.limite ? '<br>Fecha límite: ' + esc(fechaES(it.limite)) : '') +
      (it.forma ? '<br>📐 ' + esc(medidaForma(it.forma)) : '') +
      (it.notas ? '<br>' + esc(it.notas) : '') +
      '<br><button type="button" class="g-pop-btn" style="margin-top:8px;padding:5px 10px;cursor:pointer;">🙈 Ocultar del mapa</button>';
    if (it.fotos && it.fotos.length) {
      var fw = document.createElement('div');
      fw.style.cssText = 'margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;';
      it.fotos.forEach(function (f) {
        var im = document.createElement('img');
        im.style.cssText = 'width:64px;height:64px;object-fit:cover;border-radius:4px;cursor:pointer;border:1px solid #888;';
        im.width = 64; im.height = 64; im.title = 'Ver ampliada'; im.alt = 'Foto';
        im.addEventListener('click', function () { verFoto(f.id); });
        fw.appendChild(im);
        urlFoto(f.id, function (u) { if (u) im.src = u; else im.style.display = 'none'; });
      });
      pop.insertBefore(fw, pop.querySelector('.g-pop-btn'));
    }
    pop.querySelector('.g-pop-btn').addEventListener('click', function () { ocultarDelMapa(it.id); });
    return pop;
  }

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
      if (it.forma) {
        var estilo = { color: color, weight: 5, opacity: 0.95, fillColor: color, fillOpacity: 0.28 };
        var fig = it.forma.tipo === 'zona' ? L.polygon(it.forma.pts, estilo) : L.polyline(it.forma.pts, estilo);
        fig.bindPopup(popupDe(it), { minWidth: 230, maxWidth: 300 }).addTo(capa);
      }
      L.marker([it.lat, it.lon], { icon: icono, zIndexOffset: 1000 })
        .bindPopup(popupDe(it), { minWidth: 230, maxWidth: 300 }).addTo(capa);
    });
  }

  /* ---------- seguimiento nuevo a partir de un dibujo ---------- */
  function anclaForma(f) {
    if (f.tipo === 'zona') return centroidePts(f.pts);
    return f.pts[Math.floor(f.pts.length / 2)];
  }
  function formNuevoDibujo(forma) {
    var ov = document.createElement('div');
    ov.className = 'g-modal';
    ov.innerHTML = '<div class="g-modal-c"><h4>➕ Nuevo seguimiento</h4>' +
      '<div class="g-modal-med">📐 ' + esc(medidaForma(forma)) + '</div>' +
      '<label>Tipo</label><select id="gn-tipo">' + opciones(TIPOS, forma.tipo === 'linea' ? 'Camino' : 'Parcela') + '</select>' +
      '<label>Prioridad</label><select id="gn-prio">' + opciones(PRIORIDADES, 'Media') + '</select>' +
      '<label>Estado</label><select id="gn-estado">' + opciones(ESTADOS) + '</select>' +
      '<label>Responsable (opcional)</label><input id="gn-resp" type="text" list="g-resp-lista-n" maxlength="60" placeholder="Quién se encarga">' + listaResp('g-resp-lista-n') +
      '<label>Fecha límite (opcional)</label><input id="gn-limite" type="date">' +
      '<label>Notas</label><textarea id="gn-notas" rows="3" placeholder="Qué hay que revisar, quién, cuándo…"></textarea>' +
      '<div class="g-modal-bt"><button type="button" data-n="ok" class="g-primario">Guardar</button><button type="button" data-n="no">Descartar dibujo</button></div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-n]'); if (!b) return;
      if (b.getAttribute('data-n') === 'ok') {
        var a = anclaForma(forma), estado = document.getElementById('gn-estado').value;
        var it = normalizar({
          id: siguienteId(), fecha: hoyISO(), lat: +a[0].toFixed(6), lon: +a[1].toFixed(6), refcat: '',
          tipo: document.getElementById('gn-tipo').value, prioridad: document.getElementById('gn-prio').value, estado: estado,
          responsable: document.getElementById('gn-resp').value.trim(), limite: document.getElementById('gn-limite').value,
          notas: document.getElementById('gn-notas').value.trim(), diagnostico: {}, forma: forma,
          historial: [{ f: hoyISO(), t: 'Creado como «' + estado + '» dibujando ' + (forma.tipo === 'zona' ? 'una zona' : 'una línea') + ' en el mapa — ' + medidaForma(forma) }]
        });
        items.push(it); visibles[it.id] = true;
        guardar(); pintarMapa(); render();
        var mp = getMapa(); if (mp) mp.fitBounds(forma.pts, { maxZoom: 18, padding: [60, 60] });
      }
      document.body.removeChild(ov);
    });
  }

  /* ---------- modo dibujo (línea o zona) ---------- */
  var dib = null; // { it, tipo, pts, capa, barra, onClick }
  function limiteDib() { return dib.tipo === 'zona' ? 3 : 2; }
  function pintarBorrador() {
    if (!dib) return;
    dib.capa.clearLayers();
    var col = '#ff9f0a';
    dib.pts.forEach(function (p, k) {
      L.circleMarker(p, { radius: k === 0 ? 7 : 5, color: '#fff', weight: 2, fillColor: col, fillOpacity: 1 }).addTo(dib.capa);
    });
    if (dib.pts.length > 1) {
      var o = { color: col, weight: 4, dashArray: '8,6', fillColor: col, fillOpacity: 0.2 };
      (dib.tipo === 'zona' && dib.pts.length > 2 ? L.polygon(dib.pts, o) : L.polyline(dib.pts, o)).addTo(dib.capa);
    }
    var info = dib.barra.querySelector('.g-dib-info');
    var txt = dib.pts.length + ' punto(s)';
    if (dib.pts.length > 1) txt += dib.tipo === 'zona' && dib.pts.length > 2 ? ' · ' + numES(areaM2(dib.pts)) + ' m²' : ' · ' + numES(longitudM(dib.pts, false)) + ' m';
    info.textContent = txt;
    dib.barra.querySelector('[data-d="fin"]').disabled = dib.pts.length < limiteDib();
    dib.barra.querySelector('[data-d="atras"]').disabled = !dib.pts.length;
  }
  function cerrarDibujo() {
    if (!dib) return;
    var mapa = getMapa();
    if (mapa) { mapa.off('click', dib.onClick); mapa.getContainer().style.cursor = ''; if (dib.capa) mapa.removeLayer(dib.capa); }
    if (dib.barra && dib.barra.parentNode) dib.barra.parentNode.removeChild(dib.barra);
    dib = null;
  }
  function terminarDibujo() {
    if (!dib || dib.pts.length < limiteDib()) return;
    var it = dib.it, tipo = dib.tipo, pts = dib.pts.slice();
    if (!it) {
      cerrarDibujo();
      formNuevoDibujo({ tipo: tipo, pts: pts.map(function (p) { return [+p[0].toFixed(6), +p[1].toFixed(6)]; }) });
      return;
    }
    var tenia = !!it.forma;
    it.forma = { tipo: tipo, pts: pts.map(function (p) { return [+p[0].toFixed(6), +p[1].toFixed(6)]; }) };
    anotar(it, (tenia ? 'Redibujada ' : 'Dibujada ') + (tipo === 'zona' ? 'zona' : 'línea') + ' en el mapa — ' + medidaForma(it.forma));
    cerrarDibujo();
    guardar(); pintarMapa(); render();
  }
  function iniciarDibujo(it, tipo) {
    var mapa = getMapa();
    if (!mapa || typeof L === 'undefined') { alert('El mapa todavía no está listo. Espera un momento y vuelve a intentarlo.'); return; }
    cerrarDibujo();
    if (it) { visibles[it.id] = true; pintarMapa(); render(); }
    var tabMapa = document.querySelector('.tab-btn[data-panel="panel-calle"]');
    if (tabMapa) tabMapa.click();
    var barra = document.createElement('div');
    barra.className = 'g-dib-barra';
    barra.innerHTML = '<div class="g-dib-tit">✏️ Dibujando ' + (tipo === 'zona' ? 'una zona' : 'una línea') + (it ? ' para el seguimiento #' + it.id : ' para un seguimiento nuevo') + '</div>' +
      '<div class="g-dib-ayu">Haz clic en el mapa para ir poniendo puntos' + (tipo === 'zona' ? ' (mínimo 3; la zona se cierra sola)' : ' (mínimo 2)') + '. Cuando termines, pulsa «Terminar».</div>' +
      '<div class="g-dib-info"></div>' +
      '<div class="g-dib-bt"><button type="button" data-d="atras">↩️ Deshacer último punto</button><button type="button" data-d="fin" class="g-primario">✔ Terminar</button><button type="button" data-d="cancel">✖ Cancelar</button></div>';
    var cont = mapa.getContainer();
    cont.appendChild(barra);
    if (typeof L.DomEvent !== 'undefined') { L.DomEvent.disableClickPropagation(barra); L.DomEvent.disableScrollPropagation(barra); }
    dib = { it: it, tipo: tipo, pts: [], capa: L.layerGroup().addTo(mapa), barra: barra };
    dib.onClick = function (e) { dib.pts.push([e.latlng.lat, e.latlng.lng]); pintarBorrador(); };
    mapa.on('click', dib.onClick);
    cont.style.cursor = 'crosshair';
    barra.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-d]'); if (!b || b.disabled) return;
      var a = b.getAttribute('data-d');
      if (a === 'atras') { dib.pts.pop(); pintarBorrador(); }
      else if (a === 'fin') terminarDibujo();
      else if (a === 'cancel') cerrarDibujo();
    });
    pintarBorrador();
    setTimeout(function () { mapa.invalidateSize(); if (it) mapa.setView([it.lat, it.lon], Math.max(mapa.getZoom(), 17)); }, 150);
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
    panel.addEventListener('toggle', function (e) { if (e.target.classList && e.target.classList.contains('g-sug')) sugOpen = e.target.open; }, true);
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
    var nPagL = Math.ceil(lista.length / LISTA_POR_PAG);
    if (listaPag > nPagL - 1) listaPag = nPagL - 1;
    if (listaPag < 0) listaPag = 0;
    var pieL = htmlPagLista(nPagL, lista.length);
    h += pieL;
    lista.slice(listaPag * LISTA_POR_PAG, (listaPag + 1) * LISTA_POR_PAG).forEach(function (it) {
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
        (it.forma ? '<div class="g-forma">📐 ' + esc(medidaForma(it.forma)) + '</div>' : '') +
        htmlFotos(it) +
        '<details class="g-hist"><summary>🕓 Historial (' + it.historial.length + ')</summary><ul>' + hist + '</ul></details>' +
        '<div class="g-fila">' +
        (visibles[it.id] ? '<button data-accion="ver" class="g-primario">🙈 Ocultar del mapa</button>' : '<button data-accion="ver">📍 Ver en mapa</button>') +
        (it.forma ? '<button data-accion="dib-linea">✏️ Redibujar línea</button><button data-accion="dib-zona">✏️ Redibujar zona</button><button data-accion="dib-quitar">🧽 Quitar dibujo</button>'
                  : '<button data-accion="dib-linea">✏️ Dibujar línea</button><button data-accion="dib-zona">⬠ Dibujar zona</button>') +
        '<button data-accion="borrar">🗑️ Eliminar</button></div></div>';
    });
    return h + pieL;
  }

  function actualizarLista() {
    var c = document.getElementById('g-lista');
    if (c) { c.innerHTML = htmlLista(); cargarMiniaturas(); }
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
      '<li><b>Dibujar líneas y zonas:</b> en cada seguimiento puedes pulsar «Dibujar línea» (un camino, una acequia, un linde) o «Dibujar zona» (una parcela, una zona dañada). Te lleva al mapa: haces clic para poner los puntos y pulsas «Terminar». Se calcula la longitud o la superficie (medida aproximada, no sustituye a un levantamiento topográfico). También puedes crear un seguimiento nuevo directamente desde un dibujo con «Nuevo desde una línea» o «Nuevo desde una zona» (arriba, junto a Exportar). Sale en el informe, el CSV y el GeoJSON.</li>' +
      '<li><b>Fotos:</b> puedes añadir hasta 4 por seguimiento (desde el móvil se abre la cámara). Se reducen de tamaño automáticamente y se guardan <b>solo en este navegador</b>. No van en el CSV ni en el GeoJSON: para guardarlas usa <b>«Copia completa con fotos»</b> (un único archivo que luego se recupera con «Importar copia»). Las fotos sí salen en el informe imprimible.</li>' +
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
      '<button data-accion="nuevo-linea" title="Dibuja una línea en el mapa y crea un seguimiento nuevo con ella">✏️ Nuevo desde una línea</button>' +
      '<button data-accion="nuevo-zona" title="Dibuja una zona en el mapa y crea un seguimiento nuevo con ella">⬠ Nuevo desde una zona</button>' +
      '<button data-accion="mostrar-todos">📍 Ver en mapa los de la lista</button>' +
      '<button data-accion="ocultar-todos">🙈 Ocultar todos</button>' +
      '<button data-accion="exp-csv">⬇️ Exportar CSV</button>' +
      '<button data-accion="exp-geo">⬇️ Exportar GeoJSON</button>' +
      '<button data-accion="exp-full">💾 Copia completa con fotos</button>' +
      '<button data-accion="informe">🖨️ Informe imprimible</button>' +
      '<button data-accion="imp">⬆️ Importar copia</button>' +
      '<input type="file" id="g-file" accept=".json,.geojson" style="display:none"></div>' +
      listaResp('g-resp-lista-p') +
      '<div id="g-sug">' + htmlSug() + '</div>' +
      '<div id="g-lista">' + htmlLista() + '</div></div>';
    panel.innerHTML = html;
    cargarMiniaturas();
  }

  /* ---------- fotos (se guardan en IndexedDB, no en localStorage) ---------- */
  var MAX_FOTOS = 4, DB_FOTOS = 'ghistora_gestion_fotos', db = null, urlsFotos = {};
  function abrirDB(cb) {
    if (db) return cb(null, db);
    if (typeof indexedDB === 'undefined') return cb(new Error('Este navegador no permite guardar fotos.'));
    var rq;
    try { rq = indexedDB.open(DB_FOTOS, 1); } catch (e) { return cb(e); }
    rq.onupgradeneeded = function () { rq.result.createObjectStore('fotos', { keyPath: 'id' }); };
    rq.onsuccess = function () { db = rq.result; cb(null, db); };
    rq.onerror = function () { cb(rq.error || new Error('No se pudo abrir el almacén de fotos.')); };
  }
  function dbOp(modo, fn, cb) {
    abrirDB(function (err, d) {
      if (err) return cb(err);
      var res;
      try {
        var tx = d.transaction('fotos', modo);
        res = fn(tx.objectStore('fotos'));
        tx.oncomplete = function () { cb(null, res && res.result); };
        tx.onerror = function () { cb(tx.error || new Error('Error al guardar la foto.')); };
        tx.onabort = function () { cb(tx.error || new Error('No hay espacio suficiente para guardar la foto.')); };
      } catch (e) { cb(e); }
    });
  }
  function guardarFoto(rec, cb) { dbOp('readwrite', function (st) { return st.put(rec); }, function (e) { cb(e); }); }
  function leerFoto(id, cb) { dbOp('readonly', function (st) { return st.get(id); }, cb); }
  function borrarFoto(id, cb) {
    if (urlsFotos[id]) { try { URL.revokeObjectURL(urlsFotos[id]); } catch (e) {} delete urlsFotos[id]; }
    dbOp('readwrite', function (st) { return st.delete(id); }, function (e) { if (cb) cb(e); });
  }
  function urlFoto(id, cb) {
    if (urlsFotos[id]) return cb(urlsFotos[id]);
    leerFoto(id, function (err, rec) {
      if (err || !rec || !rec.blob) return cb(null);
      urlsFotos[id] = URL.createObjectURL(rec.blob);
      cb(urlsFotos[id]);
    });
  }
  function cargarMiniaturas() {
    var imgs = document.querySelectorAll('#panel-gestion img[data-fid]');
    for (var k = 0; k < imgs.length; k++) (function (img) {
      urlFoto(img.getAttribute('data-fid'), function (u) {
        if (u) img.src = u;
        else if (img.parentNode) { img.parentNode.textContent = 'No está en este navegador'; }
      });
    })(imgs[k]);
  }
  function comprimir(file, cb) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var max = 1280, r = Math.min(1, max / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * r)); c.height = Math.max(1, Math.round(img.height * r));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(function (b) {
        URL.revokeObjectURL(url);
        if (b) cb(null, b); else cb(new Error('No se pudo reducir la foto.'));
      }, 'image/jpeg', 0.72);
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(new Error('«' + file.name + '» no se puede leer como imagen (formatos válidos: JPG, PNG, WebP).')); };
    img.src = url;
  }
  function htmlFotos(it) {
    var h = '<div class="g-fotos"><span class="g-lab">Fotos (' + it.fotos.length + '/' + MAX_FOTOS + ')</span><div class="g-fotos-fila">';
    it.fotos.forEach(function (f) {
      h += '<span class="g-foto"><button type="button" class="g-foto-img" data-accion="foto-ver" data-fid="' + esc(f.id) + '" title="Ver ampliada"><img data-fid="' + esc(f.id) + '" alt="Foto del ' + esc(fechaES(f.f)) + '"></button>' +
        '<button type="button" class="g-foto-x" data-accion="foto-del" data-fid="' + esc(f.id) + '" title="Eliminar foto">✖</button></span>';
    });
    if (it.fotos.length < MAX_FOTOS) {
      h += '<label class="g-fotobtn">📷 Añadir foto<input type="file" accept="image/*" multiple data-accion="foto-add" style="display:none"></label>';
    }
    return h + '</div></div>';
  }
  function subirFotos(input) {
    var it = itemDe(input);
    if (!it || !input.files || !input.files.length) return;
    var files = Array.prototype.slice.call(input.files, 0, MAX_FOTOS - it.fotos.length);
    var extra = input.files.length - files.length;
    var errores = [];
    (function siguiente(n) {
      if (n >= files.length) {
        input.value = '';
        guardar(); actualizarLista();
        if (extra > 0) errores.push('Se ignoraron ' + extra + ' foto(s): el máximo es ' + MAX_FOTOS + ' por seguimiento.');
        if (errores.length) alert(errores.join('\n'));
        return;
      }
      comprimir(files[n], function (err, blob) {
        if (err) { errores.push(err.message); return siguiente(n + 1); }
        var id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        guardarFoto({ id: id, itemId: it.id, blob: blob, fecha: hoyISO(), nombre: files[n].name }, function (e2) {
          if (e2) { errores.push('No se pudo guardar «' + files[n].name + '»: ' + e2.message); return siguiente(n + 1); }
          it.fotos.push({ id: id, f: hoyISO(), n: files[n].name });
          anotar(it, 'Foto añadida');
          siguiente(n + 1);
        });
      });
    })(0);
  }
  function verFoto(fid) {
    urlFoto(fid, function (u) {
      if (!u) { alert('Esta foto no está disponible en este navegador.'); return; }
      var ov = document.createElement('div');
      ov.className = 'g-visor-foto';
      ov.innerHTML = '<img alt="Foto ampliada"><div class="g-vf-bt"><a class="g-vf-dl" style="color:#fff;padding:8px 12px;border:1px solid #fff;border-radius:6px;text-decoration:none;">⬇️ Descargar</a><button type="button" style="padding:8px 12px;cursor:pointer;">Cerrar</button></div>';
      ov.querySelector('img').src = u;
      var a = ov.querySelector('.g-vf-dl'); a.href = u; a.download = 'foto_' + fid + '.jpg';
      function cerrar() { document.removeEventListener('keydown', tecla); if (ov.parentNode) ov.parentNode.removeChild(ov); }
      function tecla(e) { if (e.key === 'Escape') cerrar(); }
      ov.querySelector('button').addEventListener('click', cerrar);
      ov.addEventListener('click', function (e) { if (e.target === ov) cerrar(); });
      document.addEventListener('keydown', tecla);
      document.body.appendChild(ov);
    });
  }
  function manejarFoto(acc, b) {
    var fid = b.getAttribute('data-fid');
    if (acc === 'foto-ver') verFoto(fid);
    else if (acc === 'foto-del') {
      var it = itemDe(b); if (!it) return;
      if (!confirm('¿Eliminar esta foto? No se puede deshacer.')) return;
      borrarFoto(fid, function () {
        it.fotos = it.fotos.filter(function (x) { return x.id !== fid; });
        anotar(it, 'Foto eliminada');
        guardar(); actualizarLista();
      });
    }
  }
  function dataUrlsFotos(ids, cb) {
    var out = {}, i = 0;
    (function sig() {
      if (i >= ids.length) return cb(out);
      var id = ids[i++];
      leerFoto(id, function (err, rec) {
        if (err || !rec || !rec.blob) return sig();
        var fr = new FileReader();
        fr.onload = function () { out[id] = fr.result; sig(); };
        fr.onerror = function () { sig(); };
        fr.readAsDataURL(rec.blob);
      });
    })();
  }
  function exportarCompleto() {
    var ids = [];
    items.forEach(function (it) { it.fotos.forEach(function (f) { ids.push(f.id); }); });
    dataUrlsFotos(ids, function (mapa) {
      var copia = items.map(function (it) {
        var c = JSON.parse(JSON.stringify(it));
        delete c.expSig; delete c.expFotos;
        return c;
      });
      var faltan = ids.length - Object.keys(mapa).length;
      items.forEach(function (x) { x.expFotos = idsFotos(x); });
      descargar('copia_completa_con_fotos_' + hoyISO() + '.json', 'application/json',
        JSON.stringify({ formato: 'ghistora-gestion-copia-completa', version: 1, municipio: 'Ribera de Arriba', exportado: new Date().toISOString(), items: copia, fotos: mapa }));
      if (faltan > 0) alert('Aviso: ' + faltan + ' foto(s) no se han podido leer y no van en la copia.');
    });
  }
  function importarCompleto(d) {
    var lista = Array.isArray(d.items) ? d.items : [], fotosD = (d.fotos && typeof d.fotos === 'object') ? d.fotos : {};
    var nuevos = [], pendientes = [];
    lista.forEach(function (p) {
      if (!p || typeof p.lat !== 'number' || typeof p.lon !== 'number') return;
      var fotos = (Array.isArray(p.fotos) ? p.fotos : []).filter(function (f) { return f && typeof f.id === 'string' && typeof fotosD[f.id] === 'string'; })
        .map(function (f) { return { id: f.id, f: String(f.f || hoyISO()), n: String(f.n || '') }; });
      fotos.forEach(function (f) { pendientes.push(f.id); });
      var it = normalizar({
        id: siguienteId() + nuevos.length, fecha: p.fecha || hoyISO(), lat: p.lat, lon: p.lon,
        refcat: String(p.refcat || ''), tipo: TIPOS.indexOf(p.tipo) > -1 ? p.tipo : 'Otro',
        estado: ESTADOS.indexOf(p.estado) > -1 ? p.estado : 'Pendiente',
        prioridad: PRIORIDADES.indexOf(p.prioridad) > -1 ? p.prioridad : 'Media',
        responsable: String(p.responsable || ''), limite: /^\d{4}-\d{2}-\d{2}$/.test(p.limite || '') ? p.limite : '',
        notas: String(p.notas || ''), diagnostico: (p.diagnostico && typeof p.diagnostico === 'object') ? p.diagnostico : {},
        historial: Array.isArray(p.historial) ? p.historial.filter(function (x) { return x && typeof x.f === 'string' && typeof x.t === 'string'; }) : [],
        fotos: fotos, forma: p.forma || undefined, sugerenciaId: (typeof p.sugerenciaId === 'string' && p.sugerenciaId) ? p.sugerenciaId : undefined
      });
      nuevos.push(it);
    });
    var errFotos = 0, k = 0;
    (function sig() {
      if (k >= pendientes.length) {
        nuevos.forEach(function (it) { it.expSig = firma(it); it.expFotos = idsFotos(it); items.push(it); });
        guardar(); pintarMapa(); render();
        alert('Importados ' + nuevos.length + ' seguimientos con sus fotos' + (errFotos ? ' (' + errFotos + ' foto(s) no se pudieron guardar)' : '') + '. Se han añadido a los existentes con id nuevo.');
        return;
      }
      var id = pendientes[k++];
      fetch(fotosD[id]).then(function (r) { return r.blob(); }).then(function (blob) {
        guardarFoto({ id: id, blob: blob, fecha: hoyISO() }, function (e) { if (e) errFotos++; sig(); });
      }).catch(function () { errFotos++; sig(); });
    })();
  }

  /* ---------- sugerencias del visor (precarga opcional) ---------- */
  var listaPag = 0, LISTA_POR_PAG = 15;
  function htmlPagLista(nPag, total) {
    if (nPag < 2) return '';
    return '<div class="g-pagin"><button data-accion="lst-ant"' + (listaPag === 0 ? ' disabled' : '') + '>← Anterior</button>' +
      '<span>Página ' + (listaPag + 1) + ' de ' + nPag + ' · ' + total + ' seguimientos</span>' +
      '<button data-accion="lst-sig"' + (listaPag >= nPag - 1 ? ' disabled' : '') + '>Siguiente →</button></div>';
  }
  var CLAVE_DESC = 'ghistora_gestion_ribera_descartes';
  var sugerencias = null, sugError = '', sugOrigen = 'Todas', sugPag = 0, SUG_POR_PAG = 15, sugOpen = false, sugCapa = null;
  var descartadas = {};
  try { descartadas = JSON.parse(localStorage.getItem(CLAVE_DESC) || '{}') || {}; } catch (e) { descartadas = {}; }
  function guardarDescartes() { try { localStorage.setItem(CLAVE_DESC, JSON.stringify(descartadas)); } catch (e) {} }
  var PRI_COLOR = { 'Alta': '#c4112f', 'Media': '#b8860b', 'Baja': '#4b7a5a' };

  function cargarSugerencias() {
    if (typeof fetch === 'undefined') { sugError = 'Este navegador no permite cargar las sugerencias.'; return; }
    fetch('sugerencias_gestion.geojson?v=1')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (gj) {
        sugerencias = (gj.features || []).filter(function (f) {
          return f && f.geometry && f.geometry.type === 'Point' && f.properties && f.properties.id;
        });
        actualizarSug();
      })
      .catch(function () { sugError = 'No se han podido cargar las sugerencias (¿falta el archivo sugerencias_gestion.geojson?).'; actualizarSug(); });
  }
  function yaAnadida(id) { return items.some(function (i) { return i.sugerenciaId === id; }); }
  function sugPorId(id) { return (sugerencias || []).filter(function (f) { return f.properties.id === id; })[0] || null; }
  function sugPendientes() {
    return (sugerencias || []).filter(function (f) { return !descartadas[f.properties.id] && !yaAnadida(f.properties.id); });
  }

  function htmlSug() {
    var h = '<details class="g-sug"' + (sugOpen ? ' open' : '') + '><summary>💡 Sugerencias del visor';
    if (sugError) return h + '</summary><p>' + esc(sugError) + '</p></details>';
    if (!sugerencias) return h + ' (cargando…)</summary><p>Cargando…</p></details>';
    var pend = sugPendientes();
    h += ' (' + pend.length + ' por revisar)</summary>' +
      '<p>Puntos que el propio visor propone revisar, calculados a partir de sus análisis: sectores de planeamiento con alguna alerta y parcelas con indicio de abandono agrícola. <b>No son seguimientos hasta que tú los añadas</b>: pulsa «Añadir a seguimiento» en los que te interesen y «Descartar» en los que no. Son indicios, no confirmaciones: hay que verificarlos en campo y con ortoimagen.</p>';
    var origenes = {};
    pend.forEach(function (f) { origenes[f.properties.origen] = (origenes[f.properties.origen] || 0) + 1; });
    h += '<div class="g-barra"><select data-accion="sug-origen" title="Origen"><option value="Todas">Todas (' + pend.length + ')</option>' +
      Object.keys(origenes).map(function (o) { return '<option value="' + esc(o) + '"' + (o === sugOrigen ? ' selected' : '') + '>' + esc(o) + ' (' + origenes[o] + ')</option>'; }).join('') +
      '</select><button data-accion="sug-ocultar">🙈 Quitar marca del mapa</button>';
    var nDesc = Object.keys(descartadas).length;
    if (nDesc) h += '<button data-accion="sug-restaurar">↩️ Recuperar descartadas (' + nDesc + ')</button>';
    h += '</div>';
    var lista = pend.filter(function (f) { return sugOrigen === 'Todas' || f.properties.origen === sugOrigen; });
    if (!lista.length) return h + '<p>No quedan sugerencias por revisar con este filtro.</p></details>';
    var nPag = Math.ceil(lista.length / SUG_POR_PAG);
    if (sugPag > nPag - 1) sugPag = nPag - 1;
    if (sugPag < 0) sugPag = 0;
    var pie = nPag > 1
      ? '<div class="g-pagin"><button data-accion="sug-ant"' + (sugPag === 0 ? ' disabled' : '') + '>← Anterior</button>' +
        '<span>Página ' + (sugPag + 1) + ' de ' + nPag + ' · ' + lista.length + ' sugerencias</span>' +
        '<button data-accion="sug-sig"' + (sugPag >= nPag - 1 ? ' disabled' : '') + '>Siguiente →</button></div>'
      : '';
    h += pie;
    lista.slice(sugPag * SUG_POR_PAG, (sugPag + 1) * SUG_POR_PAG).forEach(function (f) {
      var p = f.properties;
      h += '<div class="g-sug-it"><b>' + esc(p.titulo) + '</b>' +
        '<span class="g-sug-pri" style="background:' + (PRI_COLOR[p.prioridad] || '#777') + '">Prioridad ' + esc(p.prioridad) + '</span>' +
        '<span class="g-sug-mot">' + esc(p.origen) + ' · ' + esc(p.motivo) + '</span>' +
        '<div class="g-sug-bt">' +
        '<button data-accion="sug-ver" data-sid="' + esc(p.id) + '">📍 Ver en mapa</button>' +
        '<button class="g-primario" data-accion="sug-add" data-sid="' + esc(p.id) + '">➕ Añadir a seguimiento</button>' +
        '<button data-accion="sug-desc" data-sid="' + esc(p.id) + '">✖ Descartar</button></div></div>';
    });
    return h + pie + '</details>';
  }
  function actualizarSug() {
    var c = document.getElementById('g-sug');
    if (c) c.innerHTML = htmlSug();
  }

  function quitarMarcaSug() { if (sugCapa) sugCapa.clearLayers(); }
  function verSug(id) {
    var f = sugPorId(id), mapa = getMapa();
    if (!f || !mapa || typeof L === 'undefined') return;
    var c = f.geometry.coordinates, p = f.properties;
    if (!sugCapa) sugCapa = L.layerGroup().addTo(mapa);
    sugCapa.clearLayers();
    var pop = document.createElement('div');
    pop.innerHTML = '<b>💡 ' + esc(p.titulo) + '</b><br>' + esc(p.origen) + '<br>' + esc(p.motivo) +
      '<br><button type="button" class="g-pop-add" style="margin-top:8px;padding:5px 10px;cursor:pointer;">➕ Añadir a seguimiento</button>' +
      ' <button type="button" class="g-pop-q" style="margin-top:8px;padding:5px 10px;cursor:pointer;">🙈 Quitar</button>';
    pop.querySelector('.g-pop-add').addEventListener('click', function () { anadirSug(id); });
    pop.querySelector('.g-pop-q').addEventListener('click', quitarMarcaSug);
    var fs = formaSug(p);
    if (fs) {
      var est = { color: '#7e57c2', weight: 4, dashArray: '6,5', fillColor: '#b39ddb', fillOpacity: 0.3 };
      (fs.tipo === 'zona' ? L.polygon(fs.pts, est) : L.polyline(fs.pts, est)).addTo(sugCapa);
    }
    var marca = L.circleMarker([c[1], c[0]], { radius: fs ? 7 : 15, color: '#7e57c2', weight: 4, dashArray: '5,4', fillColor: '#b39ddb', fillOpacity: 0.35 })
      .bindPopup(pop, { minWidth: 230, maxWidth: 300, autoPanPadding: [30, 30] }).addTo(sugCapa);
    var tab = document.querySelector('.tab-btn[data-panel="panel-calle"]');
    if (tab) tab.click();
    setTimeout(function () {
      mapa.invalidateSize();
      if (fs) mapa.fitBounds(fs.pts, { maxZoom: 18, padding: [70, 70] }); else mapa.setView([c[1], c[0]], 17);
      setTimeout(function () { if (sugCapa && sugCapa.hasLayer(marca)) marca.openPopup(); }, 350);
    }, 150);
  }
  function formaSug(p) {
    var t = { forma: p && p.forma };
    var tmp = normalizar({ historial: [{ f: hoyISO(), t: 'x' }], forma: t.forma ? JSON.parse(JSON.stringify(t.forma)) : undefined });
    return tmp.forma || null;
  }
  function anadirSug(id) {
    var f = sugPorId(id);
    if (!f || yaAnadida(id)) return;
    var p = f.properties, c = f.geometry.coordinates;
    var tipo = TIPOS.indexOf(p.tipo) > -1 ? p.tipo : 'Otro';
    if (p.origen === 'Alerta de Planeamiento' && /inundaci/i.test(p.motivo || '')) tipo = 'Inundación';
    var it = normalizar({
      id: siguienteId(), fecha: hoyISO(), lat: c[1], lon: c[0],
      refcat: p.refcat || '', tipo: tipo, estado: 'Pendiente',
      prioridad: PRIORIDADES.indexOf(p.prioridad) > -1 ? p.prioridad : 'Media',
      responsable: '', limite: '', notas: p.nota || '',
      diagnostico: { 'Origen': p.origen, 'Elemento': p.titulo, 'Motivo': p.motivo },
      sugerenciaId: p.id, forma: formaSug(p) || undefined,
      historial: [{ f: hoyISO(), t: 'Creado desde sugerencia «' + p.origen + '» como «Pendiente»' }]
    });
    items.push(it);
    guardar(); quitarMarcaSug(); pintarMapa(); render();
  }
  function manejarSug(acc, b) {
    var id = b.getAttribute('data-sid');
    if (acc === 'sug-ver') verSug(id);
    else if (acc === 'sug-add') anadirSug(id);
    else if (acc === 'sug-desc') { descartadas[id] = true; guardarDescartes(); actualizarSug(); }
    else if (acc === 'sug-sig') { sugPag++; actualizarSug(); }
    else if (acc === 'sug-ant') { sugPag--; actualizarSug(); }
    else if (acc === 'sug-ocultar') quitarMarcaSug();
    else if (acc === 'sug-restaurar') {
      if (confirm('¿Recuperar todas las sugerencias descartadas?')) { descartadas = {}; guardarDescartes(); actualizarSug(); }
    }
  }

  /* ---------- informe imprimible ---------- */
  function informe() {
    var lista = listaFiltrada();
    if (!lista.length) { alert('No hay seguimientos en la lista actual para imprimir. Ajusta los filtros o añade alguno.'); return; }
    var w = window.open('', '_blank');
    if (!w) { alert('El navegador ha bloqueado la ventana del informe. Permite las ventanas emergentes para este sitio y vuelve a pulsar el botón.'); return; }
    var ids = [];
    lista.forEach(function (it) { it.fotos.forEach(function (f) { ids.push(f.id); }); });
    try { w.document.write('<p style="font:14px Arial;margin:20px">Preparando el informe…</p>'); } catch (e) {}
    dataUrlsFotos(ids, function (mapaF) { informeFinal(w, lista, mapaF); });
  }
  function informeFinal(w, lista, mapaF) {
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
      var fotosH = it.fotos.filter(function (f) { return mapaF[f.id]; }).map(function (f) { return '<img class="ft" src="' + mapaF[f.id] + '" alt="Foto">'; }).join('');
      return '<section class="it" style="border-left-color:' + c + '">' +
        '<h3><span class="dot" style="background:' + c + '"></span>#' + it.id + ' · ' + esc(it.tipo) +
        '<span class="pill" style="background:' + c + ';color:' + (TXT[it.estado] || '#fff') + '">' + esc(it.estado) + '</span>' +
        '<span class="pill pri" style="border-color:' + (PRIC[it.prioridad] || '#777') + ';color:' + (PRIC[it.prioridad] || '#555') + '">Prioridad ' + esc(it.prioridad) + '</span>' +
        (vencido(it) ? '<span class="pill venc">⏰ VENCIDO</span>' : '') + '</h3>' +
        '<table>' +
        '<tr><th>Responsable</th><td>' + (esc(it.responsable) || '—') + '</td><th>Fecha límite</th><td>' + (it.limite ? esc(fechaES(it.limite)) : '—') + '</td></tr>' +
        '<tr><th>Registrado</th><td>' + esc(fechaES(it.fecha)) + '</td><th>Ref. catastral</th><td>' + (esc(it.refcat) || '—') + '</td></tr>' +
        '<tr><th>Coordenadas</th><td colspan="3">' + it.lat.toFixed(5) + ', ' + it.lon.toFixed(5) + ' (WGS84)</td></tr>' +
        (it.forma ? '<tr><th>Dibujo en mapa</th><td colspan="3">' + esc(medidaForma(it.forma)) + '</td></tr>' : '') +
        (it.notas ? '<tr><th>Notas</th><td colspan="3">' + esc(it.notas).replace(/\n/g, '<br>') + '</td></tr>' : '') +
        (diag ? '<tr><th>Datos del visor</th><td colspan="3" class="peq">' + diag + '</td></tr>' : '') +
        (fotosH ? '<tr><th>Fotos</th><td colspan="3">' + fotosH + '</td></tr>' : '') +
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
      '.ft{max-width:250px;max-height:190px;margin:3px 8px 3px 0;border:1px solid #bbb;border-radius:4px;} .bar{background:#fff7dc;border-bottom:1px solid #e0cf99;padding:8px 28px;font-size:12px;} .bar button{font-size:14px;padding:6px 14px;cursor:pointer;margin-right:12px;} @media print{.bar{display:none;}} @page{margin:10mm;}';
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
    if (acc.indexOf('sug-') === 0) { manejarSug(acc, b); return; }
    if (acc.indexOf('foto-') === 0) { manejarFoto(acc, b); return; }
    if (acc === 'nuevo-linea' || acc === 'nuevo-zona') { iniciarDibujo(null, acc === 'nuevo-zona' ? 'zona' : 'linea'); return; }
    if (acc === 'dib-linea' || acc === 'dib-zona') { var itd = itemDe(b); if (itd) iniciarDibujo(itd, acc === 'dib-zona' ? 'zona' : 'linea'); return; }
    if (acc === 'dib-quitar') {
      var itq = itemDe(b);
      if (itq && itq.forma && confirm('¿Quitar el dibujo del seguimiento #' + itq.id + '? El punto se mantiene.')) {
        delete itq.forma; anotar(itq, 'Dibujo eliminado'); guardar(); pintarMapa(); render();
      }
      return;
    }
    if (acc === 'exp-full') { exportarCompleto(); return; }
    if (acc === 'lst-sig') { listaPag++; actualizarLista(); return; }
    if (acc === 'lst-ant') { listaPag--; actualizarLista(); return; }
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
      if (mapa) setTimeout(function () {
        mapa.invalidateSize();
        if (it.forma) mapa.fitBounds(it.forma.pts, { maxZoom: 18, padding: [60, 60] }); else mapa.setView([it.lat, it.lon], 17);
      }, 150);
    } else if (acc === 'borrar') {
      var it2 = itemDe(b); if (!it2) return;
      if (confirm('¿Eliminar el seguimiento #' + it2.id + '? No se puede deshacer.')) {
        (it2.fotos || []).forEach(function (f) { borrarFoto(f.id); });
        if (dib && dib.it === it2) cerrarDibujo();
        items = items.filter(function (i) { return i.id !== it2.id; });
        delete visibles[it2.id];
        guardar(); pintarMapa(); render();
      }
    }
  }

  function manejarChange(e) {
    var t = e.target;
    var acc = t.getAttribute('data-accion');
    if (acc === 'foto-add') { subirFotos(t); return; }
    if (acc === 'sug-origen') { sugOrigen = t.value; sugPag = 0; actualizarSug(); return; }
    if (acc === 'filtro-estado') { filtro = t.value; listaPag = 0; render(); return; }
    if (acc === 'filtro-tipo') { filtroTipo = t.value; listaPag = 0; render(); return; }
    if (acc === 'filtro-prio') { filtroPrio = t.value; listaPag = 0; render(); return; }
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
    if (e.target.id === 'g-buscar') { busqueda = e.target.value; listaPag = 0; actualizarLista(); }
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
    var cab = ['id', 'fecha', 'tipo', 'estado', 'prioridad', 'responsable', 'fecha_limite', 'lat', 'lon', 'ref_catastral', 'notas', 'diagnostico', 'historial', 'sugerencia_id', 'n_fotos', 'dibujo', 'medida'];
    var filas = items.map(function (i) {
      var d = Object.keys(i.diagnostico || {}).map(function (k) { return k + ': ' + i.diagnostico[k]; }).join(' | ');
      var h = i.historial.map(function (x) { return fechaES(x.f) + ' ' + x.t; }).join(' | ');
      return [i.id, i.fecha, i.tipo, i.estado, i.prioridad, i.responsable, i.limite, i.lat, i.lon, i.refcat, i.notas, d, h, i.sugerenciaId || '', i.fotos.length, i.forma ? (i.forma.tipo === 'zona' ? 'zona' : 'linea') : '', i.forma ? medidaForma(i.forma) : ''].map(celda).join(';');
    });
    descargar('seguimiento_municipal_' + hoyISO() + '.csv', 'text/csv;charset=utf-8',
      '﻿' + cab.join(';') + '\r\n' + filas.join('\r\n'));
  }
  function geomDe(i) {
    if (!i.forma) return { type: 'Point', coordinates: [i.lon, i.lat] };
    var c = i.forma.pts.map(function (p) { return [p[1], p[0]]; });
    if (i.forma.tipo === 'zona') { c.push(c[0]); return { type: 'Polygon', coordinates: [c] }; }
    return { type: 'LineString', coordinates: c };
  }
  function exportarGeoJSON() {
    var fc = {
      type: 'FeatureCollection',
      features: items.map(function (i) {
        return {
          type: 'Feature',
          geometry: geomDe(i),
          properties: { id: i.id, lat: i.lat, lon: i.lon, dibujo: i.forma ? i.forma.tipo : '', fecha: i.fecha, tipo: i.tipo, estado: i.estado, prioridad: i.prioridad,
            responsable: i.responsable, fecha_limite: i.limite,
            ref_catastral: i.refcat, notas: i.notas, diagnostico: i.diagnostico || {}, historial: i.historial, sugerencia_id: i.sugerenciaId || '', n_fotos: i.fotos.length }
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
        if (fc && fc.formato === 'ghistora-gestion-copia-completa') { importarCompleto(fc); return; }
        var feats = (fc && fc.features) || [];
        var n = 0;
        feats.forEach(function (f) {
          if (!f.geometry) return;
          var p = f.properties || {}, c = f.geometry.coordinates, forma = null;
          if (f.geometry.type === 'LineString' || f.geometry.type === 'Polygon') {
            var anillo = f.geometry.type === 'Polygon' ? (c && c[0]) : c;
            if (!Array.isArray(anillo)) return;
            var pts = anillo.filter(function (q) { return Array.isArray(q) && typeof q[0] === 'number' && typeof q[1] === 'number'; }).map(function (q) { return [q[1], q[0]]; });
            if (f.geometry.type === 'Polygon' && pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts.pop();
            forma = { tipo: f.geometry.type === 'Polygon' ? 'zona' : 'linea', pts: pts };
            if (pts.length < (forma.tipo === 'zona' ? 3 : 2)) return;
            var ce = (typeof p.lat === 'number' && typeof p.lon === 'number') ? [p.lat, p.lon] : centroidePts(pts);
            c = [ce[1], ce[0]];
          } else if (f.geometry.type !== 'Point') return;
          if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') return;
          var hist = Array.isArray(p.historial) ? p.historial.filter(function (x) { return x && typeof x.f === 'string' && typeof x.t === 'string'; }) : [];
          items.push(normalizar({
            id: siguienteId(), fecha: p.fecha || hoyISO(), lat: c[1], lon: c[0],
            refcat: p.ref_catastral || '', tipo: TIPOS.indexOf(p.tipo) > -1 ? p.tipo : 'Otro',
            estado: ESTADOS.indexOf(p.estado) > -1 ? p.estado : 'Pendiente',
            prioridad: PRIORIDADES.indexOf(p.prioridad) > -1 ? p.prioridad : 'Media',
            responsable: String(p.responsable || ''), limite: /^\d{4}-\d{2}-\d{2}$/.test(p.fecha_limite || '') ? p.fecha_limite : '',
            notas: String(p.notas || ''), diagnostico: (p.diagnostico && typeof p.diagnostico === 'object') ? p.diagnostico : {},
            historial: hist, forma: forma || undefined,
            sugerenciaId: (typeof p.sugerencia_id === 'string' && p.sugerencia_id) ? p.sugerencia_id : undefined
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
    cargarSugerencias();
    var intentos = 0;
    (function esperarMapa() {
      if (getMapa()) { pintarMapa(); return; }
      if (++intentos < 40) setTimeout(esperarMapa, 250);
    })();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
