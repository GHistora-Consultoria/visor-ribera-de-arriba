/* edificios.js — Edificios en zona inundable (07/10/2026)
   Lista de edificios del Catastro (servicios públicos, sin uso asignado o con pista de OpenStreetMap) que tocan la
   zona inundable T500, con: (1) lo oficial de Catastro, (2) la pista de OpenStreetMap explicada y (3) campos que
   rellena el ayuntamiento (qué es, quién lo confirma, notas y fotos).
   Sin servidor ni cuentas: lo que se escribe vive en el navegador (localStorage + IndexedDB para las fotos) y se
   saca con Exportar CSV / GeoJSON / Copia completa con fotos. Se engancha a window.mapaTerraPropio sin tocar visor.js.
   Datos: edificios_inundables.geojson (lo genera preparar_edificios_visor_v1.py en TERRA). */
(function () {
  'use strict';

  var CLAVE = 'ghistora_edificios_ribera_v1';
  var URL_DATOS = 'edificios_inundables.geojson';
  var FECHA_CATASTRO = '07/10/2026'; // fecha en que se consultó Catastro para generar edificios_inundables.geojson (cambiar al regenerar)
  var MAX_FOTOS = 6;
  var GRUPO_MANUAL = 'Añadido por el ayuntamiento';
  var ZONAS_MANUAL = ['Sin comprobar', 'T10 (inundación frecuente)', 'T100', 'T500', 'Fuera de las zonas inundables'];
  var DB_FOTOS = 'ghistora_edificios_fotos';
  var PENDIENTE = 'Pendiente de verificar';
  var TIPOS = [PENDIENTE,
    'Sanitario (centro de salud, consultorio, hospital)',
    'Educativo (colegio, escuela infantil)',
    'Residencia de personas mayores o con discapacidad',
    'Deportivo cubierto (pabellón, polideportivo)',
    'Deportivo descubierto (pistas, piscina al aire libre)',
    'Instalación auxiliar de uso deportivo (vestuarios, almacén)',
    'Parque de bomberos / Protección Civil',
    'Depuradora o infraestructura de aguas',
    'Administrativo (ayuntamiento, oficinas públicas)',
    'Social o cultural (centro social, biblioteca, casa de cultura)',
    'Religioso',
    'Comercial', 'Industrial', 'Almacén o cobertizo', 'Vivienda', 'Otro (describir en el detalle)'];

  var OSM_NOMBRE = { pitch: 'campo o pista deportiva', swimming_pool: 'piscina', pharmacy: 'farmacia', school: 'colegio',
    kindergarten: 'escuela infantil', clinic: 'clínica', doctors: 'consulta médica', townhall: 'ayuntamiento', fire_station: 'parque de bomberos',
    community_centre: 'centro social', library: 'biblioteca', place_of_worship: 'lugar de culto', sports_centre: 'centro deportivo', stadium: 'estadio' };

  /* ---------- utilidades ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function hoyISO() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fechaES(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : (iso || ''); }
  function num(v, dec) { var n = parseFloat(v); return isNaN(n) ? '' : n.toLocaleString('es-ES', { maximumFractionDigits: dec == null ? 0 : dec }); }

  /* ---------- almacenamiento ---------- */
  var avisoStorage = false;
  function cargar() {
    try { var d = JSON.parse(localStorage.getItem(CLAVE) || '{}'); return (d && typeof d === 'object' && !Array.isArray(d)) ? d : {}; }
    catch (e) { return {}; }
  }
  var reg = cargar();
  function guardar() {
    try { localStorage.setItem(CLAVE, JSON.stringify(reg)); }
    catch (e) {
      if (!avisoStorage) { avisoStorage = true; alert('No se pudo guardar en este navegador (¿modo privado o almacenamiento bloqueado?). Exporta tus datos para no perderlos.'); }
    }
  }
  function r(ref) {
    if (!reg[ref]) reg[ref] = { tipo: '', detalle: '', por: '', fecha: '', notas: '', fotos: [] };
    if (!Array.isArray(reg[ref].fotos)) reg[ref].fotos = [];
    return reg[ref];
  }
  function verificado(ref) { var x = reg[ref]; return !!(x && x.tipo && x.tipo !== PENDIENTE); }

  /* ---------- datos ---------- */
  var datos = null, datosCat = null, cargando = false, errorDatos = '', esperando = [];
  function featuresManuales() {
    var out = [];
    Object.keys(reg).forEach(function (id) {
      var x = reg[id];
      if (!x || !x.manual || typeof x.manual.lat !== 'number' || typeof x.manual.lon !== 'number') return;
      var m = x.manual, z = m.zona || 'Sin comprobar';
      var t10 = z.indexOf('T10 ') === 0, t100 = t10 || z === 'T100', t500 = t100 || z === 'T500';
      out.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [m.lon, m.lat] }, properties: {
        ref: id, manual: true, grupo: GRUPO_MANUAL, uso_inspire: '', estado: 'sin dato', huella_m2: parseFloat(m.sup) || 0,
        viviendas: parseInt(m.viv, 10) || 0, T10: t10, T100: t100, T500: t500, ZFP: m.zfp === 'Sí', pct_T500: null,
        zona_manual: z, zfp_manual: m.zfp || 'Sin comprobar', motivo: m.motivo || '', creado: m.creado || '',
        complejo: '', suelo: '', osm_cat: '', osm_nombre: '', cat_uso: '', cat_destino: '', cat_sup_m2: '', cat_anio: '', cat_dir: '', cat_n_inmuebles: 0, cat_aviso: '', enlace: '' } });
    });
    out.sort(function (a, b) { return a.properties.ref < b.properties.ref ? 1 : -1; });
    return out;
  }
  function reconstruirDatos() { if (datosCat) datos = featuresManuales().concat(datosCat); }
  function cargarDatos(cb) {
    if (datos) return cb && cb();
    if (cb) esperando.push(cb);
    if (cargando) return;
    cargando = true;
    fetch(URL_DATOS + '?v=' + Date.now()).then(function (resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    }).then(function (j) {
      datosCat = (j.features || []).slice().sort(function (a, b) {
        var ca = a.properties.complejo || 'ZZ', cb2 = b.properties.complejo || 'ZZ';
        return ca < cb2 ? -1 : ca > cb2 ? 1 : (b.properties.huella_m2 - a.properties.huella_m2);
      });
      reconstruirDatos();
      cargando = false; actualizarCaja();
      var l = esperando; esperando = []; l.forEach(function (f) { f(); });
    }).catch(function (e) {
      cargando = false; errorDatos = String(e && e.message || e);
      var l = esperando; esperando = []; l.forEach(function (f) { f(); });
    });
  }
  function porRef(ref) { return (datos || []).filter(function (f) { return f.properties.ref === ref; })[0]; }
  function actualizarCaja() {
    var v = document.getElementById('ed-caja-val'), s = document.getElementById('ed-caja-sub');
    if (!v || !datos) return;
    var n = datosCat.length, nm = datos.length - n, ok = datos.filter(function (f) { return verificado(f.properties.ref); }).length;
    v.textContent = n + ' edificios';
    s.textContent = 'del Catastro tocan la zona inundable T500; ' + ok + ' verificados por el ayuntamiento' + (nm ? '; ' + nm + ' añadidos por el ayuntamiento' : '') + ' (en este navegador)';
  }

  /* ---------- estilos ---------- */
  var st = document.createElement('style');
  st.textContent = [
    '#panel-edificios { overflow:auto; }',
    '#panel-edificios > *:not(.cielo-estrellado) { position:relative; z-index:1; }',
    '#panel-edificios button { background:var(--navy-light); color:var(--text-light); border:1px solid var(--border); border-radius:6px; padding:7px 12px; cursor:pointer; font-size:13px; font-family:inherit; }',
    '#panel-edificios button:hover { border-color:var(--gold); }',
    '#panel-edificios .e-primario { background:var(--gold); color:#1a1a1a; border-color:var(--gold); font-weight:600; }',
    '#panel-edificios select, #panel-edificios textarea, #panel-edificios input[type=text], #panel-edificios input[type=date], #panel-edificios input[type=search] { width:100%; box-sizing:border-box; background:var(--navy-dark); color:var(--text-light); border:1px solid var(--border); border-radius:6px; padding:7px 9px; font-size:14px; font-family:inherit; }',
    '.e-wrap { padding:24px; max-width:1000px; margin:0 auto; width:100%; box-sizing:border-box; }',
    '.e-wrap h2 { color:var(--gold-bright); margin:8px 0 6px; font-weight:normal; }',
    '.e-sub { color:var(--text-muted); font-size:13px; margin-bottom:14px; line-height:1.5; }',
    '.e-expl { background:var(--navy-light); border:1px solid var(--border); border-radius:8px; padding:4px 14px; margin-bottom:14px; font-size:13.5px; line-height:1.55; }',
    '.e-expl summary { cursor:pointer; padding:8px 0; color:var(--gold-bright); }',
    '.e-expl ul { margin:6px 0 10px 18px; padding:0; } .e-expl li { margin-bottom:6px; }',
    '.e-cajas { display:grid; grid-template-columns:repeat(auto-fit,minmax(130px,1fr)); gap:12px; margin-bottom:14px; }',
    '.e-caja { background:var(--navy-light); border:1px solid var(--border); border-radius:8px; padding:12px; }',
    '.e-caja b { display:block; font-size:24px; color:var(--gold-bright); } .e-caja span { font-size:12px; color:var(--text-muted); }',
    '.e-barra { display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-bottom:12px; }',
    '#panel-edificios .e-barra select { width:auto; } #panel-edificios .e-barra input[type=search] { flex:1; min-width:170px; width:auto; }',
    '.e-item { background:var(--navy-light); border:1px solid var(--border); border-left:5px solid #c0504d; border-radius:8px; padding:12px 14px; margin-bottom:12px; }',
    '.e-item.e-ok { border-left-color:#30e36b; }',
    '.e-item h4 { margin:0 0 6px; font-size:15px; color:var(--text-light); font-weight:normal; }',
    '.e-item h4 a { color:var(--gold-bright); }',
    '.e-ins { display:inline-block; margin-left:6px; padding:1px 8px; border-radius:10px; font-size:11px; font-weight:600; vertical-align:middle; white-space:nowrap; }',
    '.e-ins-ok { background:#e3f8ea; color:#157a3a; border:1px solid #30e36b; } .e-ins-no { background:#fff3d6; color:#8a5a00; border:1px solid #ffb300; }',
    '.e-ins-cx { background:#e8eefc; color:#26468a; border:1px solid #7f9fe0; }',
    '.e-chips { display:flex; flex-wrap:wrap; gap:6px; margin:4px 0 10px; }',
    '.e-chip { font-size:11.5px; padding:2px 8px; border-radius:10px; border:1px solid var(--border); color:var(--text-light); background:var(--navy-dark); }',
    '.e-chip.e-t10 { border-color:#d62728; color:#ff8a8c; } .e-chip.e-t100 { border-color:#ff7f0e; color:#ffb066; } .e-chip.e-t500 { border-color:#e6c229; color:#f0d867; } .e-chip.e-zfp { border-color:#ffd600; color:#ffe55c; }',
    '.e-bloque { border-radius:6px; padding:8px 10px; margin-bottom:8px; font-size:13.5px; line-height:1.5; }',
    '.e-cat { background:rgba(91,138,201,.14); border:1px solid rgba(91,138,201,.45); }',
    '.e-osm { background:rgba(171,71,188,.12); border:1px dashed rgba(171,71,188,.6); }',
    '.e-ayto { background:rgba(48,227,107,.07); border:1px solid rgba(48,227,107,.35); }',
    '.e-bloque b.e-tit { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); margin-bottom:3px; font-weight:600; }',
    '.e-ayto label { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); margin:8px 0 3px; }',
    '.e-fila { display:grid; grid-template-columns:1fr 1fr; gap:10px; } @media (max-width:600px){ .e-fila { grid-template-columns:1fr; } }',
    '.e-fotos-fila { display:flex; flex-wrap:wrap; align-items:center; margin-top:6px; }',
    '.e-foto { position:relative; display:inline-block; margin:0 10px 8px 0; }',
    '#panel-edificios button.e-foto-img { padding:0; width:92px; height:92px; overflow:hidden; border-radius:6px; border:2px solid var(--border); background:var(--navy-dark); color:var(--text-muted); font-size:11px; }',
    '.e-foto-img img { width:100%; height:100%; object-fit:cover; display:block; }',
    '#panel-edificios button.e-foto-x { position:absolute; top:-7px; right:-7px; width:24px; height:24px; padding:0; border-radius:50%; background:#c4112f; color:#fff; border:2px solid #fff; font-size:11px; line-height:1; }',
    '.e-fotobtn { display:inline-block; padding:7px 12px; border:1px dashed var(--gold); border-radius:6px; cursor:pointer; font-size:13px; color:var(--gold-bright); margin:0 0 8px; }',
    '.e-visor-foto { position:fixed; inset:0; background:rgba(0,0,0,.88); z-index:100000; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:16px; }',
    '.e-visor-foto img { max-width:96vw; max-height:80vh; border-radius:6px; background:#000; }',
    '.e-art23 { width:100%; border-collapse:collapse; margin:8px 0; font-size:13px; } .e-art23 th, .e-art23 td { border:1px solid var(--border); padding:6px 8px; text-align:left; vertical-align:top; } .e-art23 th { color:var(--text-muted); font-weight:600; font-size:11.5px; text-transform:uppercase; letter-spacing:.04em; } .e-art23 td.n { text-align:right; white-space:nowrap; } .e-art23 small { color:var(--text-muted); display:block; }',
    '.e-guardado { font-size:11.5px; color:#30e36b; margin-left:8px; }'
  ].join('\n');
  document.head.appendChild(st);

  /* ---------- fotos (IndexedDB) ---------- */
  var db = null, urlsFotos = {};
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
  function guardarFoto(rec, cb) { dbOp('readwrite', function (s) { return s.put(rec); }, function (e) { cb(e); }); }
  function leerFoto(id, cb) { dbOp('readonly', function (s) { return s.get(id); }, cb); }
  function borrarFoto(id, cb) {
    if (urlsFotos[id]) { try { URL.revokeObjectURL(urlsFotos[id]); } catch (e) {} delete urlsFotos[id]; }
    dbOp('readwrite', function (s) { return s.delete(id); }, function (e) { if (cb) cb(e); });
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
    var imgs = document.querySelectorAll('#panel-edificios img[data-fid]');
    for (var k = 0; k < imgs.length; k++) (function (img) {
      urlFoto(img.getAttribute('data-fid'), function (u) {
        if (u) img.src = u; else if (img.parentNode) img.parentNode.textContent = 'No está en este navegador';
      });
    })(imgs[k]);
  }
  function comprimir(file, cb) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var max = 1280, k = Math.min(1, max / Math.max(img.width, img.height));
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(function (b) { URL.revokeObjectURL(url); if (b) cb(null, b); else cb(new Error('No se pudo reducir la foto.')); }, 'image/jpeg', 0.8);
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(new Error('No se pudo leer «' + file.name + '» como imagen.')); };
    img.src = url;
  }
  function verFoto(fid) {
    urlFoto(fid, function (u) {
      if (!u) { alert('Esta foto no está disponible en este navegador.'); return; }
      var ov = document.createElement('div');
      ov.className = 'e-visor-foto';
      ov.innerHTML = '<img alt="Foto ampliada"><div style="margin-top:12px;display:flex;gap:10px;"><a class="e-vf-dl" style="color:#fff;padding:8px 12px;border:1px solid #fff;border-radius:6px;text-decoration:none;">⬇️ Descargar</a><button type="button" style="padding:8px 12px;cursor:pointer;">Cerrar</button></div>';
      ov.querySelector('img').src = u;
      var a = ov.querySelector('.e-vf-dl'); a.href = u; a.download = 'foto_' + fid + '.jpg';
      function cerrar() { document.removeEventListener('keydown', tecla); if (ov.parentNode) ov.parentNode.removeChild(ov); }
      function tecla(e) { if (e.key === 'Escape') cerrar(); }
      ov.querySelector('button').addEventListener('click', cerrar);
      ov.addEventListener('click', function (e) { if (e.target === ov) cerrar(); });
      document.addEventListener('keydown', tecla);
      document.body.appendChild(ov);
    });
  }
  function subirFotos(input, ref) {
    var x = r(ref);
    if (!input.files || !input.files.length) return;
    var files = Array.prototype.slice.call(input.files, 0, MAX_FOTOS - x.fotos.length);
    var extra = input.files.length - files.length, errores = [];
    (function siguiente(n) {
      if (n >= files.length) {
        input.value = ''; guardar(); pintarLista();
        if (extra > 0) errores.push('Se ignoraron ' + extra + ' foto(s): el máximo es ' + MAX_FOTOS + ' por edificio.');
        if (errores.length) alert(errores.join('\n'));
        return;
      }
      comprimir(files[n], function (err, blob) {
        if (err) { errores.push(err.message); return siguiente(n + 1); }
        var id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
        guardarFoto({ id: id, ref: ref, blob: blob, fecha: hoyISO(), nombre: files[n].name }, function (e2) {
          if (e2) { errores.push('No se pudo guardar «' + files[n].name + '»: ' + e2.message); return siguiente(n + 1); }
          x.fotos.push({ id: id, f: hoyISO(), n: files[n].name });
          siguiente(n + 1);
        });
      });
    })(0);
  }

  /* ---------- texto de cada bloque ---------- */
  function osmTexto(p) {
    var cats = String(p.osm_cat || '').split(' + ').filter(function (c, i, a) { return c && a.indexOf(c) === i; });
    var noms = String(p.osm_nombre || '').split(' | ').filter(function (c, i, a) { return c && a.indexOf(c) === i; })
      .map(function (n) { return OSM_NOMBRE[n] || n; });
    return { cats: cats.join(', '), noms: noms.join('; ') };
  }
  function chips(p) {
    var h = '';
    if (p.manual) {
      if (p.T10) h += '<span class="e-chip e-t10">En T10 (frecuente)</span>';
      if (p.T100 && !p.T10) h += '<span class="e-chip e-t100">En T100</span>';
      if (p.T500 && !p.T100) h += '<span class="e-chip e-t500">En T500</span>';
      if (!p.T500) h += '<span class="e-chip">Zona inundable: ' + (p.zona_manual === 'Sin comprobar' ? 'sin comprobar' : 'fuera de las zonas') + '</span>';
      if (p.ZFP) h += '<span class="e-chip e-zfp">En zona de flujo preferente</span>';
      if (p.huella_m2) h += '<span class="e-chip">Superficie aprox.: ' + num(p.huella_m2, 0) + ' m²</span>';
      if (p.viviendas) h += '<span class="e-chip">Viviendas: ' + num(p.viviendas) + '</span>';
      return h;
    }
    if (p.T10) h += '<span class="e-chip e-t10">Toca T10 (frecuente)</span>';
    if (p.T100) h += '<span class="e-chip e-t100">Toca T100</span>';
    h += '<span class="e-chip e-t500">Toca T500' + (p.pct_T500 != null ? ' · ' + num(p.pct_T500, 0) + ' % de la huella' : '') + '</span>';
    if (p.ZFP) h += '<span class="e-chip e-zfp">Toca zona de flujo preferente</span>';
    if (p.suelo) h += '<span class="e-chip">Suelo: ' + esc(p.suelo) + '</span>';
    h += '<span class="e-chip">Huella: ' + num(p.huella_m2, 0) + ' m²</span>';
    h += '<span class="e-chip" title="Estado de conservación según Catastro (INSPIRE), no si está ocupado">Estado: ' + esc(p.estado) + '</span>';
    return h;
  }
  function bloqueManual(p) {
    var ref = esc(p.ref), x = reg[p.ref] || {}, m = x.manual || {};
    function op(l, a) { return l.map(function (o) { return '<option' + (o === a ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join(''); }
    return '<div class="e-bloque e-cat" style="background:rgba(255,193,7,.10);border-color:rgba(255,193,7,.55);"><b class="e-tit">No consta en Catastro · añadido por el ayuntamiento' + (m.creado ? ' el ' + esc(fechaES(m.creado)) : '') + '</b>' +
      'Este edificio no figura en la cartografía del Catastro consultada, por eso no ha entrado en el cruce. La ubicación es la del punto marcado en el mapa. Si es una construcción nueva o sin declarar, puede regularizarse con la declaración de alteraciones catastrales (modelo 900D).' +
      '<div class="e-fila"><div><label>¿En qué zona inundable está?</label><select data-manual="zona" data-ref="' + ref + '">' + op(ZONAS_MANUAL, m.zona || 'Sin comprobar') + '</select></div>' +
      '<div><label>¿En zona de flujo preferente?</label><select data-manual="zfp" data-ref="' + ref + '">' + op(['Sin comprobar', 'Sí', 'No'], m.zfp || 'Sin comprobar') + '</select></div></div>' +
      '<div class="e-fila"><div><label>Superficie aproximada (m²)</label><input type="text" inputmode="decimal" maxlength="9" data-manual="sup" data-ref="' + ref + '" value="' + esc(m.sup || '') + '"></div>' +
      '<div><label>Viviendas (si es residencial)</label><input type="text" inputmode="numeric" maxlength="4" data-manual="viv" data-ref="' + ref + '" value="' + esc(m.viv || '') + '"></div></div>' +
      '<label>Motivo por el que se añade</label><select data-manual="motivo" data-ref="' + ref + '">' + op(['', 'No aparece en el Catastro', 'Aparece en el Catastro con otro uso o referencia', 'Otro (explicar en las notas)'], m.motivo || '') + '</select>' +
      '<div style="margin-top:8px;"><button type="button" data-accion="manual-del" data-ref="' + ref + '">🗑 Eliminar este edificio añadido</button></div></div>';
  }
  function bloqueCatastro(p) {
    if (p.manual) return bloqueManual(p);
    var h = '<div class="e-bloque e-cat"><b class="e-tit">Catastro (fuente oficial)</b>';
    if (p.cat_uso) {
      h += 'Uso principal: <b>' + esc(p.cat_uso) + '</b>';
      if (p.cat_destino && p.cat_destino.toLowerCase() !== p.cat_uso.toLowerCase()) h += ' · Destino de la construcción: ' + esc(p.cat_destino);
      if (p.cat_sup_m2 !== '' && p.cat_sup_m2 != null) h += '<br>Superficie construida: ' + num(p.cat_sup_m2, 0) + ' m²';
      if (p.cat_anio) h += ' · Año de construcción: ' + esc(p.cat_anio);
      if (p.cat_dir) h += '<br>Dirección: ' + esc(p.cat_dir);
      if (p.cat_n_inmuebles > 1) h += '<br>La referencia agrupa ' + p.cat_n_inmuebles + ' inmuebles; se muestran todos juntos.';
      h += '<br><span style="color:var(--text-muted);font-size:12.5px;">El uso catastral dice para qué está dado de alta el inmueble; no dice si es un «equipamiento básico» ni si el deportivo está cubierto o al aire libre.</span>';
    } else {
      h += 'La ficha de Catastro <b>no informa de un uso</b> para este edificio (en los datos de edificios figura como «' + esc(p.uso_inspire) + '»).';
      if (p.cat_aviso) h += '<br><span style="color:var(--text-muted);font-size:12.5px;">' + esc(p.cat_aviso) + '</span>';
    }
    h += '<br><span style="color:var(--text-muted);font-size:12.5px;">Fuente: Dirección General del Catastro, consultado el ' + FECHA_CATASTRO + '.</span>';
    return h + '</div>';
  }
  function bloqueOsm(p) {
    if (p.manual) return '';
    if (!p.osm_cat && !p.osm_nombre) return '';
    var o = osmTexto(p);
    return '<div class="e-bloque e-osm"><b class="e-tit">Pista de OpenStreetMap (no oficial)</b>' +
      'En el mapa colaborativo OpenStreetMap hay algo marcado en este punto como: <b>' + esc(o.cats || 'equipamiento') + '</b>' +
      (o.noms ? ' (' + esc(o.noms) + ')' : '') + '.' +
      '<br><span style="color:var(--text-muted);font-size:12.5px;">OpenStreetMap lo edita cualquiera y ninguna administración lo revisa. Aquí solo sirve de pista para saber qué comprobar; puede estar equivocado o desactualizado.</span></div>';
  }
  function bloqueAyto(p) {
    var x = r(p.ref), ref = esc(p.ref);
    var h = '<div class="e-bloque e-ayto"><b class="e-tit">Ayuntamiento: qué es este edificio</b>' +
      '<label>Qué es</label><select data-campo="tipo" data-ref="' + ref + '">' +
      TIPOS.map(function (t) { return '<option' + ((x.tipo || PENDIENTE) === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select>' +
      '<label>Detalle (nombre, titularidad, uso real…)</label><input type="text" maxlength="200" data-campo="detalle" data-ref="' + ref + '" value="' + esc(x.detalle) + '" placeholder="Ej.: Consultorio local, titularidad municipal">' +
      '<div class="e-fila"><div><label>Lo confirma (nombre o servicio)</label><input type="text" maxlength="80" data-campo="por" data-ref="' + ref + '" value="' + esc(x.por) + '"></div>' +
      '<div><label>Fecha de la comprobación</label><input type="date" data-campo="fecha" data-ref="' + ref + '" value="' + esc(x.fecha) + '"></div></div>' +
      '<label>Notas</label><textarea rows="2" maxlength="1000" data-campo="notas" data-ref="' + ref + '" placeholder="Cómo se ha comprobado, qué falta, a quién consultar…">' + esc(x.notas) + '</textarea>' +
      '<div><label>Fotos (' + x.fotos.length + '/' + MAX_FOTOS + ')</label><div class="e-fotos-fila">';
    x.fotos.forEach(function (f) {
      h += '<span class="e-foto"><button type="button" class="e-foto-img" data-accion="foto-ver" data-fid="' + esc(f.id) + '" title="Ver ampliada"><img data-fid="' + esc(f.id) + '" alt="Foto del ' + esc(fechaES(f.f)) + '"></button>' +
        '<button type="button" class="e-foto-x" data-accion="foto-del" data-ref="' + ref + '" data-fid="' + esc(f.id) + '" title="Eliminar foto">✖</button></span>';
    });
    if (x.fotos.length < MAX_FOTOS) h += '<button type="button" data-accion="foto-abrir">📷 Añadir foto</button><input type="file" accept="image/*" multiple data-accion="foto-add" data-ref="' + ref + '" style="display:none">';
    return h + '</div></div></div>';
  }
  function insignias(ref, p) {
    return (verificado(ref) ? '<span class="e-ins e-ins-ok">✔ Verificado por el ayuntamiento</span>' : '<span class="e-ins e-ins-no">⏳ Pendiente de verificar</span>') +
      (p.manual ? '<span class="e-ins e-ins-cx" style="background:#fff3d6;color:#8a5a00;border-color:#ffb300;">➕ Añadido por el ayuntamiento</span>' : '') +
      (p.cat_uso ? '<span class="e-ins e-ins-cx">Catastro: ' + esc(p.cat_uso) + '</span>' : '');
  }
  function tarjeta(f) {
    var p = f.properties, ref = esc(p.ref);
    return '<div class="e-item' + (verificado(p.ref) ? ' e-ok' : '') + '" data-ref="' + ref + '">' +
      '<h4>' + (p.manual ? ref : (p.enlace ? '<a href="' + esc(p.enlace) + '" target="_blank" rel="noopener">' + ref + '</a>' : ref)) +
      (p.complejo ? ' · complejo ' + esc(p.complejo) : '') + '<span class="e-ins-lugar" data-ref="' + ref + '">' + insignias(p.ref, p) + '</span></h4>' +
      '<div class="e-chips">' + chips(p) + '</div>' + bloqueCatastro(p) + bloqueOsm(p) + bloqueAyto(p) +
      '<button type="button" class="e-btn-mapa" data-accion="' + (resaltados[p.ref] ? 'mapa-quitar' : 'mapa') + '" data-ref="' + ref + '">' + (resaltados[p.ref] ? '✖ Quitar resalte del mapa' : '🗺️ Ver en el mapa') + '</button>' +
      (p.complejo ? ' <button type="button" data-accion="mapa-complejo" data-cx="' + esc(p.complejo) + '">🗺️ Resaltar todo el complejo ' + esc(p.complejo) + '</button>' : '') + '</div>';
  }

  /* ---------- panel ---------- */
  var panel, contenido, filtroEstado = 'Todos', filtroZona = 'Todas', filtroGrupo = 'Todos los usos', busqueda = '', mostrados = 40, PASO = 40;
  var GRUPOS = ['Todos los usos', 'Servicios públicos', 'Industrial', 'Comercial y oficinas', 'Residencial', 'Agrario', 'Sin clasificar', GRUPO_MANUAL];
  function pasaFiltro(f) {
    var p = f.properties;
    if (filtroEstado === 'Pendientes' && verificado(p.ref)) return false;
    if (filtroEstado === 'Verificados' && !verificado(p.ref)) return false;
    if (filtroGrupo !== 'Todos los usos' && (p.grupo || 'Sin clasificar') !== filtroGrupo) return false;
    if (filtroZona === 'T10' && !p.T10) return false;
    if (filtroZona === 'T100' && !p.T100) return false;
    if (filtroZona === 'ZFP' && !p.ZFP) return false;
    if (filtroZona === 'Sin uso en Catastro' && (p.cat_uso || p.manual)) return false;
    if (busqueda) {
      var x = reg[p.ref] || {};
      var t = [p.ref, p.complejo, p.cat_uso, p.cat_destino, p.cat_dir, p.osm_cat, p.osm_nombre, x.tipo, x.detalle, x.notas].join(' ').toLowerCase();
      if (t.indexOf(busqueda.toLowerCase()) < 0) return false;
    }
    return true;
  }
  function resumenHTML() {
    var n = datosCat.length, nm = datos.length - n, ok = datos.filter(function (f) { return verificado(f.properties.ref); }).length;
    var cx = datos.filter(function (f) { return f.properties.cat_uso; }).length;
    var t10 = datos.filter(function (f) { return f.properties.T10; }).length;
    var zf = datos.filter(function (f) { return f.properties.ZFP; }).length;
    function c(v, t) { return '<div class="e-caja"><b>' + v + '</b><span>' + t + '</span></div>'; }
    var np = datosCat.filter(function (f) { return f.properties.grupo !== 'Residencial' && f.properties.grupo !== 'Agrario'; }).length;
    return c(n, 'edificios del Catastro que tocan T500') + c(np, 'no son vivienda ni agrarios') + c(ok + ' de ' + datos.length, 'verificados por el ayuntamiento') + (nm ? c(nm, 'añadidos por el ayuntamiento') : '') + c(t10, 'tocan T10 (inundación frecuente)') + c(zf, 'tocan la zona de flujo preferente');
  }
  function explicacionHTML() {
    return '<details class="e-expl" open><summary>¿Qué es esta lista y cómo leerla?</summary>' +
      '<ul><li><b>Qué incluye.</b> <b>Todos</b> los edificios del Catastro cuya huella toca la zona inundable de baja probabilidad (T500) del Ministerio, sea cual sea su uso: servicios públicos, industrial, comercial, vivienda y agrario. Con el filtro «Todos los usos» puedes elegir qué ver. Un edificio que no esté dibujado en la cartografía del Catastro (obra reciente o sin declarar) no puede aparecer aquí. Si el ayuntamiento detecta alguno, el titular puede regularizarlo con la declaración de alteraciones catastrales (modelo 900D, Orden HAC/1293/2018); cuando el Catastro lo incorpore, aparecerá en este cruce al actualizar los datos.</li>' +
      '<li><b>Edificios que Catastro no tiene.</b> Con el botón «➕ Añadir edificio que no está en Catastro» el ayuntamiento marca su ubicación en el mapa y completa su ficha. Figuran aparte en el resumen.</li>' +
      '<li><b>«Toca» no es «está afectado».</b> Quiere decir que una parte de la huella del edificio cae dentro de la zona; el porcentaje indica cuánta. Que un edificio toque la zona no dice nada sobre su vulnerabilidad real.</li>' +
      '<li><b>Tres fuentes, tres colores.</b> En azul, lo que dice la ficha de <b>Catastro</b> (oficial). En morado, la <b>pista de OpenStreetMap</b> (no oficial, solo para orientar). En verde, lo que <b>comprueba y escribe el ayuntamiento</b>.</li>' +
      '<li><b>Por qué debe completarlo el ayuntamiento.</b> El proyecto de Real Decreto (sin aprobar) pide identificar «edificios públicos, equipamientos básicos y zonas comerciales» en zona inundable (art. 23.2.b), pero no define qué es un «equipamiento básico». Cita ejemplos (hospitales, centros escolares o sanitarios, residencias, centros deportivos cubiertos, parques de bomberos…; y, como servicios públicos esenciales, también centros deportivos descubiertos, depuradoras e instalaciones de Protección Civil). Decidir en cuál encaja cada edificio es una comprobación que hace quien lo conoce.</li>' +
      '<li><b>Dónde se guarda lo que escribas.</b> Solo en este navegador y en este ordenador. Para conservarlo o pasarlo a otro equipo, usa los botones de exportar. Si se borran los datos del navegador, se pierde.</li>' +
      '<li><b>Para qué sirve.</b> Es una base de trabajo para ordenar el programa municipal de adaptación (art. 23.2.b del proyecto) y para llegar con los datos preparados a la consulta con la Confederación Hidrográfica del Cantábrico, organismo competente en zonas inundables.</li></ul></details>';
  }

  function fichaArt23HTML() {
    var a = reg.__art23 || {};
    function inp(k, l, ph) { return '<div><label>' + l + '</label><input type="text" inputmode="numeric" maxlength="8" data-art23="' + k + '" value="' + esc(a[k] || '') + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '></div>'; }
    return '<div class="e-bloque e-ayto"><b class="e-tit">Ayuntamiento: datos que completa con sus propios registros (art. 23.2.c y 23.2.d)</b>' +
      'Los datos de población los aporta el ayuntamiento con el padrón municipal. Este visor no los trae ni los consulta.' +
      '<label>Población residente en cada zona (habitantes)</label><div class="e-fila" style="grid-template-columns:repeat(4,1fr);">' +
      inp('pob_T10', 'En T10') + inp('pob_T100', 'En T100') + inp('pob_T500', 'En T500') + inp('pob_ZFP', 'En flujo preferente') + '</div>' +
      '<div class="e-fila"><div><label>Fecha del padrón utilizado</label><input type="date" data-art23="pob_fecha" value="' + esc(a.pob_fecha || '') + '"></div>' +
      '<div><label>Lo confirma (nombre o servicio)</label><input type="text" maxlength="80" data-art23="pob_por" value="' + esc(a.pob_por || '') + '"></div></div>' +
      '<label>Tipología y características de las edificaciones residenciales (23.2.c)</label><textarea rows="2" maxlength="1500" data-art23="tipologia">' + esc(a.tipologia || '') + '</textarea>' +
      '<label>Zonas industriales identificadas, tipologías y riesgos tecnológicos y ambientales asociados (23.2.d)</label><textarea rows="3" maxlength="2000" data-art23="industrial">' + esc(a.industrial || '') + '</textarea>' +
      '<label>Notas</label><textarea rows="2" maxlength="1500" data-art23="notas">' + esc(a.notas || '') + '</textarea>' +
      '<div style="margin-top:8px;"><button type="button" data-accion="art23-csv">⬇️ Exportar resumen y datos (CSV)</button></div></div>';
  }
  function resumenArt23HTML() {
    var ESC = [['T10', 'T10 (frecuente)'], ['T100', 'T100 (media)'], ['T500', 'T500 (baja)'], ['ZFP', 'Flujo preferente']];
    var FILAS = [
      ['Servicios públicos', 'b) Edificios públicos y equipamientos'],
      ['Comercial y oficinas', 'b) Zonas comerciales'],
      ['Residencial', 'c) Edificaciones residenciales'],
      ['Industrial', 'd) Zonas industriales'],
      ['Agrario', 'No figura en el art. 23.2'],
      ['Sin clasificar', 'Sin uso en los datos de edificios'],
      [GRUPO_MANUAL, 'Añadidos por el ayuntamiento (no constan en Catastro)']];
    function cuenta(grupo, esc) {
      var l = datos.filter(function (f) { return (f.properties.grupo || 'Sin clasificar') === grupo && f.properties[esc]; });
      var v = 0; l.forEach(function (f) { v += (f.properties.viviendas || 0); });
      return { n: l.length, v: v };
    }
    var h = '<details class="e-expl" open><summary>Resumen para el programa municipal de adaptación (art. 23.2 del proyecto de RD, sin aprobar)</summary>' +
      '<table class="e-art23"><thead><tr><th>Apartado del art. 23.2</th><th>Uso según Catastro</th>' + ESC.map(function (e) { return '<th>' + e[1] + '</th>'; }).join('') + '</tr></thead><tbody>';
    FILAS.forEach(function (fl) {
      h += '<tr><td>' + esc(fl[1]) + '</td><td>' + esc(fl[0]) + '</td>';
      ESC.forEach(function (e) {
        var c = cuenta(fl[0], e[0]);
        h += '<td class="n">' + c.n + (c.v > 0 ? '<small>' + num(c.v) + ' viviendas</small>' : '') + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table>';
    var res = datos.filter(function (f) { return f.properties.grupo === 'Residencial' && f.properties.T500; });
    var est = { f: 0, d: 0, r: 0, o: 0 };
    res.forEach(function (f) {
      var e = String(f.properties.estado || '');
      if (e.indexOf('functional') >= 0) est.f++; else if (e.indexOf('declined') >= 0) est.d++; else if (e.indexOf('ruin') >= 0) est.r++; else est.o++;
    });
    h += '<p class="e-sub" style="margin:6px 0;"><b>Edificios residenciales en T500 según su estado de conservación en Catastro:</b> ' + est.f + ' funcionales, ' + est.d + ' deficientes («declined»), ' + est.r + ' ruinosos («ruin»)' + (est.o ? ', ' + est.o + ' sin dato' : '') +
      '. El estado de conservación no dice si el edificio está habitado.</p>' +
      '<ul><li><b>Cada cifra cuenta edificios cuya huella toca la zona</b>, no edificios afectados. Las viviendas son las que figuran en Catastro dentro de esos edificios.</li>' +
      '<li><b>Población (art. 23.2.c).</b> Catastro registra viviendas, no personas. El número de habitantes residentes en zona inundable lo completa el ayuntamiento con el padrón municipal.</li>' +
      '<li><b>Cada fila cuenta cada zona por separado.</b> Un edificio en T10 también está en T100 y en T500, así que no se pueden sumar las columnas.</li>' +
      '<li><b>Zonas industriales (art. 23.2.d).</b> La fila cuenta edificios con uso industrial en Catastro (muchos son almacenes pequeños). Qué conjuntos constituyen una «zona industrial» y sus riesgos tecnológicos y ambientales lo valora el ayuntamiento.</li></ul>' + fichaArt23HTML() + '</details>';
    return h;
  }
  function barraHTML() {
    function op(l, a) { return l.map(function (o) { return '<option' + (o === a ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join(''); }
    return '<div class="e-barra"><select data-filtro="estado">' + op(['Todos', 'Pendientes', 'Verificados'], filtroEstado) + '</select>' +
      '<select data-filtro="grupo">' + op(GRUPOS, filtroGrupo) + '</select>' +
      '<select data-filtro="zona">' + op(['Todas', 'T10', 'T100', 'ZFP', 'Sin uso en Catastro'], filtroZona) + '</select>' +
      '<input type="search" data-filtro="busca" placeholder="Buscar por referencia, uso, nombre…" value="' + esc(busqueda) + '"></div>' +
      '<div class="e-barra"><button type="button" class="e-primario" data-accion="anadir">➕ Añadir edificio que no está en Catastro</button></div>' +
      '<div class="e-barra"><button type="button" class="e-primario" data-accion="csv">⬇️ Exportar CSV</button>' +
      '<button type="button" data-accion="geojson">⬇️ Exportar GeoJSON</button>' +
      '<button type="button" data-accion="completa">💾 Copia completa con fotos</button>' +
      '<button type="button" data-accion="importar-abrir">📂 Importar copia</button>' +
      '<input type="file" id="e-input-import" accept=".json,application/json" data-accion="importar" style="display:none">' +
      '</div><div class="e-barra"><button type="button" data-accion="mapa-todos">🗺️ Ver todos en el mapa</button>' +
      '<button type="button" data-accion="mapa-quitar-todo">🧹 Quitar resaltes del mapa</button>' +
      '<span class="e-sub" id="e-estado-mapa" style="margin:0;"></span></div>';
  }
  function pintarLista() {
    if (!panel) return;
    var cont = document.getElementById('e-lista');
    if (!cont) return pintar();
    var vis = datos.filter(pasaFiltro);
    var cortar = vis.slice(0, mostrados);
    cont.innerHTML = vis.length ? cortar.map(tarjeta).join('') +
      (vis.length > mostrados ? '<div class="e-barra" style="justify-content:center;"><button type="button" class="e-primario" data-accion="mas">Mostrar ' + Math.min(PASO, vis.length - mostrados) + ' más (' + mostrados + ' de ' + vis.length + ' con estos filtros)</button></div>' : '<p class="e-sub">' + vis.length + ' edificios con estos filtros.</p>')
      : '<p class="e-sub">Ningún edificio con estos filtros.</p>';
    var rs = document.getElementById('e-resumen'); if (rs) rs.innerHTML = resumenHTML();
    var a23 = document.getElementById('e-art23');
    if (a23) { var d0 = a23.querySelector('details'), ab = d0 ? d0.open : true; a23.innerHTML = resumenArt23HTML(); var d1 = a23.querySelector('details'); if (d1 && !ab) d1.open = false; }
    cargarMiniaturas(); actualizarCaja(); actualizarBotonesMapa();
  }
  function pintar() {
    if (!panel) return;
    var h = '<div class="e-wrap"><button type="button" data-accion="volver">← Volver al panel de datos</button>' +
      '<h2>🏢 Edificios en zona inundable (T500) — Ribera de Arriba</h2>' +
      '<div class="e-sub">Edificios del Catastro que tocan la zona inundable del Ministerio, con lo oficial, las pistas y lo que verifica el ayuntamiento.</div>';
    if (!datos) {
      h += '<div class="e-sub">' + (errorDatos ? 'No se pudieron cargar los datos (' + esc(errorDatos) + '). Si abres el visor como archivo local, sírvelo desde un servidor o desde la web publicada.' : 'Cargando datos…') + '</div></div>';
      contenido.innerHTML = h; return;
    }
    h += explicacionHTML() + '<div id="e-art23">' + resumenArt23HTML() + '</div><div class="e-cajas" id="e-resumen">' + resumenHTML() + '</div>' + barraHTML() + '<div id="e-lista"></div></div>';
    contenido.innerHTML = h;
    pintarLista();
  }
  function mostrarPanel() {
    document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
    panel.classList.add('active');
  }
  function irATab(idPanel) {
    var b = document.querySelector('.tab-btn[data-panel="' + idPanel + '"]');
    if (b) b.click();
  }
  window.abrirEdificios = function (ref) {
    var ov = document.getElementById('modal-overlay'); if (ov) ov.classList.remove('activo');
    if (!panel) montar();
    mostrarPanel();
    if (ref) { busqueda = ref; filtroEstado = 'Todos'; filtroZona = 'Todas'; filtroGrupo = 'Todos los usos'; mostrados = PASO; }
    pintar();
    if (!datos) cargarDatos(function () { pintar(); });
  };

  /* ---------- mapa ---------- */
  var capaMapa = null, resaltados = {}, verTodos = false;
  var COLOR_RESALTE = '#00e5ff';
  function getMapa() { return window.mapaTerraPropio || null; }
  function nResaltados() { return Object.keys(resaltados).length; }
  function estiloDe(f, resaltado) {
    var ok = verificado(f.properties.ref), c = ok ? '#30e36b' : '#ff9f0a';
    if (resaltado) return { color: COLOR_RESALTE, weight: 5, opacity: 1, fillColor: c, fillOpacity: 0.5 };
    return { color: c, weight: 2, opacity: 0.9, fillColor: c, fillOpacity: 0.3 };
  }
  function popupDe(f) {
    var p = f.properties, d = document.createElement('div'), x = reg[p.ref] || {};
    d.innerHTML = '<b>' + esc(p.ref) + '</b>' + (p.complejo ? ' · complejo ' + esc(p.complejo) : '') +
      (p.manual ? '<br>Añadido por el ayuntamiento (no consta en Catastro)' : '<br>Catastro: ' + esc(p.cat_uso || 'sin uso en la ficha')) +
      (verificado(p.ref) ? '<br>Ayuntamiento: <b>' + esc(x.tipo) + '</b>' : '<br>⏳ Pendiente de verificar') +
      '<br>' + (p.manual ? (p.T500 ? 'Zona: ' + esc(p.zona_manual) : 'Zona inundable: ' + (p.zona_manual === 'Sin comprobar' ? 'sin comprobar' : 'fuera de las zonas')) : (p.T10 ? 'Toca T10 · ' : '') + (p.T100 ? 'Toca T100 · ' : '') + 'Toca T500') + (p.ZFP ? ' · Flujo preferente' : '') +
      '<br><button type="button" class="e-pop-a" style="margin-top:8px;padding:5px 10px;cursor:pointer;">Abrir ficha</button> ' +
      '<button type="button" class="e-pop-q" style="margin-top:8px;padding:5px 10px;cursor:pointer;">' + (resaltados[p.ref] ? 'Quitar resalte' : 'Resaltar') + '</button>';
    d.querySelector('.e-pop-a').addEventListener('click', function () { window.abrirEdificios(p.ref); });
    d.querySelector('.e-pop-q').addEventListener('click', function () {
      if (resaltados[p.ref]) delete resaltados[p.ref]; else resaltados[p.ref] = true;
      var m = getMapa(); if (m) m.closePopup();
      pintarCapaMapa(); actualizarBotonesMapa();
    });
    return d;
  }
  function actualizarBotonesMapa() {
    if (!panel) return;
    var bs = panel.querySelectorAll('.e-btn-mapa');
    for (var k = 0; k < bs.length; k++) {
      var ref = bs[k].getAttribute('data-ref'), on = !!resaltados[ref];
      bs[k].setAttribute('data-accion', on ? 'mapa-quitar' : 'mapa');
      bs[k].textContent = on ? '✖ Quitar resalte del mapa' : '🗺️ Ver en el mapa';
    }
    var t = document.getElementById('e-estado-mapa');
    if (t) t.textContent = nResaltados() ? nResaltados() + ' edificio(s) resaltado(s) en el mapa' + (verTodos ? ' (se muestran todos)' : '') : (verTodos ? 'Se muestran todos en el mapa' : '');
  }
  /* Dibuja la capa: los resaltados (borde cian + aro) y, si se pide, todos los demás en suave. Persiste al cerrar el popup. */
  function pintarCapaMapa() {
    var mapa = getMapa();
    if (!mapa || typeof L === 'undefined' || !datos) return;
    if (capaMapa) { mapa.removeLayer(capaMapa); capaMapa = null; }
    var feats = datos.filter(function (f) { return verTodos || resaltados[f.properties.ref]; });
    if (!feats.length) return;
    capaMapa = L.featureGroup().addTo(mapa);
    feats.forEach(function (f) {
      var res = !!resaltados[f.properties.ref];
      var lyr = L.geoJSON(f, { style: function () { return estiloDe(f, res); }, pointToLayer: function (ft, ll) { return L.circleMarker(ll, { radius: res ? 11 : 8 }); } });
      lyr.eachLayer(function (l) { l.bindPopup(function () { return popupDe(f); }, { minWidth: 220, maxWidth: 300 }); l.feature = f; l.addTo(capaMapa); });
      if (res) {
        var c = lyr.getBounds().getCenter(), rad = Math.max(14, 0.75 * Math.sqrt(f.properties.huella_m2 || 100));
        L.circle(c, { radius: rad, color: COLOR_RESALTE, weight: 3, dashArray: '6 6', fill: false, interactive: false }).addTo(capaMapa);
      }
    });
  }
  function irAlMapa(refs) {
    var mapa = getMapa();
    irATab('panel-calle');
    setTimeout(function () {
      try { mapa.invalidateSize(); } catch (e) {}
      if (!capaMapa) return;
      var objetivo = null, caja = null;
      capaMapa.eachLayer(function (l) {
        if (!l.feature || refs.indexOf(l.feature.properties.ref) < 0) return;
        objetivo = objetivo || l;
        var bb = l.getBounds ? l.getBounds() : L.latLngBounds([l.getLatLng(), l.getLatLng()]);
        caja = caja ? caja.extend(bb) : L.latLngBounds(bb.getSouthWest(), bb.getNorthEast());
      });
      if (caja) mapa.fitBounds(caja, { maxZoom: 19, padding: [60, 60] });
      if (objetivo && refs.length === 1) objetivo.openPopup();
    }, 250);
  }
  function mapaListo() {
    if (!getMapa() || typeof L === 'undefined') { alert('El mapa todavía no está listo. Prueba de nuevo en unos segundos.'); return false; }
    return !!datos;
  }
  function verEnMapa(ref) {
    if (!mapaListo()) return;
    resaltados[ref] = true; pintarCapaMapa(); actualizarBotonesMapa(); irAlMapa([ref]);
  }
  function resaltarComplejo(cx) {
    if (!mapaListo()) return;
    var refs = datos.filter(function (f) { return f.properties.complejo === cx; }).map(function (f) { return f.properties.ref; });
    refs.forEach(function (r2) { resaltados[r2] = true; });
    pintarCapaMapa(); actualizarBotonesMapa(); irAlMapa(refs);
  }
  function verTodosEnMapa() {
    if (!mapaListo()) return;
    verTodos = true; pintarCapaMapa(); actualizarBotonesMapa(); irAlMapa(datos.map(function (f) { return f.properties.ref; }));
  }
  function quitarResalte(ref) { delete resaltados[ref]; pintarCapaMapa(); actualizarBotonesMapa(); }
  function quitarTodoDelMapa() { resaltados = {}; verTodos = false; pintarCapaMapa(); actualizarBotonesMapa(); }

  /* ---------- añadir edificio que no está en Catastro ---------- */
  var modoAnadir = null;
  function siguienteIdManual() {
    var max = 0;
    Object.keys(reg).forEach(function (k) { var m = /^MANUAL-(\d+)$/.exec(k); if (m) max = Math.max(max, parseInt(m[1], 10)); });
    var n = String(max + 1); while (n.length < 3) n = '0' + n;
    return 'MANUAL-' + n;
  }
  function cancelarAnadir() {
    if (!modoAnadir) return;
    var mapa = getMapa();
    if (mapa) { mapa.off('click', modoAnadir.click); try { mapa.getContainer().style.cursor = ''; } catch (e) {} }
    document.removeEventListener('keydown', modoAnadir.tecla);
    if (modoAnadir.banner && modoAnadir.banner.parentNode) modoAnadir.banner.parentNode.removeChild(modoAnadir.banner);
    modoAnadir = null;
  }
  function crearManual(lat, lon) {
    var id = siguienteIdManual();
    reg[id] = { tipo: '', detalle: '', por: '', fecha: '', notas: '', fotos: [], manual: { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, zona: 'Sin comprobar', zfp: 'Sin comprobar', sup: '', viv: '', motivo: '', creado: hoyISO() } };
    guardar(); reconstruirDatos(); resaltados[id] = true;
    pintarCapaMapa(); actualizarBotonesMapa(); actualizarCaja();
    window.abrirEdificios(id);
  }
  function iniciarAnadir() {
    if (!getMapa() || typeof L === 'undefined') { alert('El mapa todavía no está listo. Prueba de nuevo en unos segundos.'); return; }
    if (!datos) return;
    cancelarAnadir();
    var mapa = getMapa();
    irATab('panel-calle');
    var banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:78px;left:50%;transform:translateX(-50%);z-index:100001;background:#1a2a44;color:#fff;border:2px solid #ffc107;border-radius:8px;padding:10px 14px;font-size:14px;box-shadow:0 4px 14px rgba(0,0,0,.5);display:flex;gap:12px;align-items:center;max-width:92vw;';
    banner.innerHTML = '<span>📍 Haz clic en el mapa, sobre el edificio que quieres añadir.</span><button type="button" style="padding:5px 10px;cursor:pointer;">Cancelar</button>';
    document.body.appendChild(banner);
    var estado = { banner: banner };
    estado.click = function (ev) { var ll = ev.latlng; cancelarAnadir(); crearManual(ll.lat, ll.lng); };
    estado.tecla = function (ev) { if (ev.key === 'Escape') cancelarAnadir(); };
    banner.querySelector('button').addEventListener('click', cancelarAnadir);
    document.addEventListener('keydown', estado.tecla);
    modoAnadir = estado;
    setTimeout(function () { try { mapa.invalidateSize(); mapa.getContainer().style.cursor = 'crosshair'; } catch (e) {} mapa.on('click', estado.click); }, 400);
  }
  function eliminarManual(ref) {
    var x = reg[ref]; if (!x || !x.manual) return;
    if (!confirm('¿Eliminar «' + ref + '» y sus fotos? Esta acción no se puede deshacer.')) return;
    (x.fotos || []).forEach(function (f) { borrarFoto(f.id); });
    delete reg[ref]; delete resaltados[ref];
    guardar(); reconstruirDatos(); pintarLista(); pintarCapaMapa(); actualizarBotonesMapa(); actualizarCaja();
  }

  /* ---------- exportar / importar ---------- */
  function descargar(nombre, tipo, contenido) {
    var blob = new Blob([contenido], { type: tipo }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = nombre;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function celda(v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"'; }
  function filaDatos(f) {
    var p = f.properties, x = reg[p.ref] || {}, o = osmTexto(p);
    return { id: p.ref, origen: p.manual ? 'Añadido por el ayuntamiento (no consta en Catastro)' : 'Catastro', referencia_catastral: p.manual ? '' : p.ref, complejo: p.complejo, uso_catastro: p.cat_uso, destino_catastro: p.cat_destino, superficie_catastro_m2: p.cat_sup_m2,
      anio_catastro: p.cat_anio, direccion_catastro: p.cat_dir, uso_en_datos_de_edificios: p.uso_inspire, estado_conservacion: p.estado, huella_m2: p.huella_m2,
      toca_T10: p.T10 ? 'sí' : 'no', toca_T100: p.T100 ? 'sí' : 'no', toca_T500: p.T500 ? 'sí' : 'no', pct_huella_T500: p.pct_T500,
      toca_zona_flujo_preferente: p.ZFP ? 'sí' : 'no', clase_suelo: p.suelo, pista_osm_no_oficial: o.cats, nombre_osm: o.noms,
      ayto_que_es: x.tipo || PENDIENTE, ayto_detalle: x.detalle || '', ayto_confirma: x.por || '', ayto_fecha: x.fecha || '', ayto_notas: x.notas || '',
      n_fotos: (x.fotos || []).length, enlace_catastro: p.enlace,
      manual_zona: p.manual ? p.zona_manual : '', manual_flujo_preferente: p.manual ? p.zfp_manual : '', manual_viviendas: p.manual ? p.viviendas : '', manual_motivo: p.manual ? p.motivo : '' };
  }
  function exportarArt23CSV() {
    var a = reg.__art23 || {}, L2 = [];
    var ESC = [['T10', 'T10'], ['T100', 'T100'], ['T500', 'T500'], ['ZFP', 'flujo preferente']];
    L2.push(['Apartado art. 23.2', 'Uso', 'Zona', 'Edificios', 'Viviendas']);
    var grupos = ['Servicios públicos', 'Comercial y oficinas', 'Residencial', 'Industrial', 'Agrario', 'Sin clasificar', GRUPO_MANUAL];
    var ap = { 'Servicios públicos': 'b', 'Comercial y oficinas': 'b', 'Residencial': 'c', 'Industrial': 'd' };
    grupos.forEach(function (g) {
      ESC.forEach(function (e) {
        var l = datos.filter(function (f) { return (f.properties.grupo || 'Sin clasificar') === g && f.properties[e[0]]; }), v = 0;
        l.forEach(function (f) { v += f.properties.viviendas || 0; });
        L2.push([ap[g] || '', g, e[1], l.length, v]);
      });
    });
    L2.push([]);
    L2.push(['Datos del ayuntamiento', 'Valor']);
    [['Población en T10', 'pob_T10'], ['Población en T100', 'pob_T100'], ['Población en T500', 'pob_T500'], ['Población en flujo preferente', 'pob_ZFP'], ['Fecha del padrón', 'pob_fecha'], ['Lo confirma', 'pob_por'],
     ['Tipología de las edificaciones residenciales', 'tipologia'], ['Zonas industriales y riesgos', 'industrial'], ['Notas', 'notas']].forEach(function (c) { L2.push([c[0], a[c[1]] || '']); });
    descargar('resumen_art23_ribera_de_arriba_' + hoyISO() + '.csv', 'text/csv;charset=utf-8', '﻿' + L2.map(function (f) { return f.map(celda).join(';'); }).join('\r\n'));
  }
  function exportarCSV() {
    var filas = datos.map(filaDatos), cab = Object.keys(filas[0]);
    descargar('edificios_zona_inundable_' + hoyISO() + '.csv', 'text/csv;charset=utf-8',
      '﻿' + cab.join(';') + '\r\n' + filas.map(function (f) { return cab.map(function (k) { return celda(f[k]); }).join(';'); }).join('\r\n'));
  }
  function exportarGeoJSON() {
    var fc = { type: 'FeatureCollection', features: datos.map(function (f) { return { type: 'Feature', geometry: f.geometry, properties: filaDatos(f) }; }) };
    descargar('edificios_zona_inundable_' + hoyISO() + '.geojson', 'application/geo+json', JSON.stringify(fc));
  }
  function blobADataURL(blob, cb) { var fr = new FileReader(); fr.onload = function () { cb(fr.result); }; fr.onerror = function () { cb(null); }; fr.readAsDataURL(blob); }
  function exportarCompleto() {
    var ids = [];
    Object.keys(reg).forEach(function (k) { (reg[k].fotos || []).forEach(function (f) { ids.push(f.id); }); });
    var mapa = {}, faltan = 0;
    (function sig(n) {
      if (n >= ids.length) {
        descargar('copia_completa_edificios_' + hoyISO() + '.json', 'application/json',
          JSON.stringify({ formato: 'ghistora-edificios-copia-completa', version: 1, municipio: 'Ribera de Arriba', exportado: new Date().toISOString(), registros: reg, fotos: mapa }));
        if (faltan) alert('Aviso: ' + faltan + ' foto(s) no se han podido leer y no van en la copia.');
        return;
      }
      leerFoto(ids[n], function (err, rec) {
        if (err || !rec || !rec.blob) { faltan++; return sig(n + 1); }
        blobADataURL(rec.blob, function (u) { if (u) mapa[ids[n]] = u; else faltan++; sig(n + 1); });
      });
    })(0);
  }
  function importarCopia(input) {
    var file = input.files && input.files[0]; if (!file) return;
    var fr = new FileReader();
    fr.onload = function () {
      var d;
      try { d = JSON.parse(fr.result); } catch (e) { alert('El archivo no es una copia válida.'); return; }
      if (!d || d.formato !== 'ghistora-edificios-copia-completa' || typeof d.registros !== 'object') { alert('Este archivo no es una copia completa de edificios.'); return; }
      var refs = Object.keys(d.registros).filter(function (k) { return k !== '__art23'; });
      var a23 = d.registros.__art23;
      if (!confirm('Se van a cargar los datos de ' + refs.length + ' edificio(s). Si ya tenías datos de esos mismos edificios en este navegador, se sustituirán. ¿Continuar?')) return;
      var fotosD = (d.fotos && typeof d.fotos === 'object') ? d.fotos : {}, pendientes = [], fallos = 0;
      refs.forEach(function (ref) {
        var s = d.registros[ref] || {};
        var fotos = (Array.isArray(s.fotos) ? s.fotos : []).filter(function (f) { return f && typeof f.id === 'string' && typeof fotosD[f.id] === 'string'; });
        fotos.forEach(function (f) { pendientes.push({ id: f.id, ref: ref }); });
        reg[ref] = { tipo: String(s.tipo || ''), detalle: String(s.detalle || ''), por: String(s.por || ''), fecha: String(s.fecha || ''), notas: String(s.notas || ''), fotos: fotos };
        var sm = s.manual;
        if (/^MANUAL-\d+$/.test(ref) && sm && typeof sm.lat === 'number' && typeof sm.lon === 'number') {
          reg[ref].manual = { lat: sm.lat, lon: sm.lon, zona: ZONAS_MANUAL.indexOf(sm.zona) >= 0 ? sm.zona : 'Sin comprobar', zfp: ['Sí', 'No'].indexOf(sm.zfp) >= 0 ? sm.zfp : 'Sin comprobar', sup: String(sm.sup || '').slice(0, 9), viv: String(sm.viv || '').slice(0, 4), motivo: String(sm.motivo || '').slice(0, 80), creado: String(sm.creado || '').slice(0, 10) };
        }
      });
      if (a23 && typeof a23 === 'object') { reg.__art23 = {}; ['pob_T10', 'pob_T100', 'pob_T500', 'pob_ZFP', 'pob_fecha', 'pob_por', 'tipologia', 'industrial', 'notas'].forEach(function (k) { reg.__art23[k] = String(a23[k] || '').slice(0, 2000); }); }
      guardar(); reconstruirDatos();
      (function sig(n) {
        if (n >= pendientes.length) { input.value = ''; pintarLista(); alert('Copia cargada: ' + refs.length + ' edificio(s)' + (fallos ? ' (' + fallos + ' foto(s) no se pudieron guardar)' : '') + '.'); return; }
        fetch(fotosD[pendientes[n].id]).then(function (rr) { return rr.blob(); }).then(function (blob) {
          guardarFoto({ id: pendientes[n].id, ref: pendientes[n].ref, blob: blob, fecha: hoyISO() }, function (e) { if (e) fallos++; sig(n + 1); });
        }).catch(function () { fallos++; sig(n + 1); });
      })(0);
    };
    fr.readAsText(file);
  }

  /* ---------- eventos ---------- */
  function manejarClick(e) {
    var b = e.target.closest('[data-accion]'); if (!b) return;
    var acc = b.getAttribute('data-accion'), ref = b.getAttribute('data-ref'), fid = b.getAttribute('data-fid');
    if (acc === 'volver') irATab('panel-demo');
    else if (acc === 'mas') { mostrados += PASO; pintarLista(); }
    else if (acc === 'anadir') iniciarAnadir();
    else if (acc === 'manual-del') eliminarManual(ref);
    else if (acc === 'art23-csv') exportarArt23CSV();
    else if (acc === 'mapa') verEnMapa(ref);
    else if (acc === 'mapa-quitar') quitarResalte(ref);
    else if (acc === 'mapa-complejo') resaltarComplejo(b.getAttribute('data-cx'));
    else if (acc === 'mapa-todos') verTodosEnMapa();
    else if (acc === 'mapa-quitar-todo') quitarTodoDelMapa();
    else if (acc === 'importar-abrir') { var inp = document.getElementById('e-input-import'); if (inp) inp.click(); }
    else if (acc === 'foto-abrir') { var fi2 = b.parentNode.querySelector('input[type=file]'); if (fi2) fi2.click(); }
    else if (acc === 'csv') exportarCSV();
    else if (acc === 'geojson') exportarGeoJSON();
    else if (acc === 'completa') exportarCompleto();
    else if (acc === 'foto-ver') verFoto(fid);
    else if (acc === 'foto-del') {
      if (!confirm('¿Eliminar esta foto? No se puede deshacer.')) return;
      var x = r(ref); x.fotos = x.fotos.filter(function (f) { return f.id !== fid; });
      borrarFoto(fid, function () { guardar(); pintarLista(); });
    }
  }
  function refrescarEstadoTarjeta(ref) {
    var f = porRef(ref); if (!f) return;
    var card = panel.querySelector('.e-item[data-ref="' + ref.replace(/"/g, '') + '"]');
    if (card) {
      card.classList.toggle('e-ok', verificado(ref));
      var lugar = card.querySelector('.e-ins-lugar'); if (lugar) lugar.innerHTML = insignias(ref, f.properties);
    }
    var rs = document.getElementById('e-resumen'); if (rs) rs.innerHTML = resumenHTML();
    actualizarCaja();
    if (capaMapa) pintarCapaMapa();
  }
  function manejarChange(e) {
    var t = e.target, fl = t.getAttribute('data-filtro'), campo = t.getAttribute('data-campo'), acc = t.getAttribute('data-accion');
    if (fl) {
      if (fl === 'estado') filtroEstado = t.value; else if (fl === 'zona') filtroZona = t.value; else if (fl === 'grupo') filtroGrupo = t.value; else busqueda = t.value;
      mostrados = PASO; pintarLista(); return;
    }
    var am = t.getAttribute('data-art23'), mm = t.getAttribute('data-manual');
    if (am) { if (!reg.__art23) reg.__art23 = {}; reg.__art23[am] = t.value; guardar(); return; }
    if (mm) {
      var xm = reg[t.getAttribute('data-ref')]; if (!xm || !xm.manual) return;
      xm.manual[mm] = t.value; guardar(); reconstruirDatos(); pintarLista(); if (capaMapa) pintarCapaMapa(); return;
    }
    if (acc === 'foto-add') { subirFotos(t, t.getAttribute('data-ref')); return; }
    if (acc === 'importar') { importarCopia(t); return; }
    if (campo) {
      var ref = t.getAttribute('data-ref'), x = r(ref);
      x[campo] = t.value;
      if (campo === 'tipo' && t.value !== PENDIENTE && !x.fecha) {
        x.fecha = hoyISO();
        var fi = panel.querySelector('input[data-campo="fecha"][data-ref="' + ref + '"]'); if (fi) fi.value = x.fecha;
      }
      guardar(); refrescarEstadoTarjeta(ref);
    }
  }
  function manejarInput(e) {
    var t = e.target;
    if (t.getAttribute('data-filtro') === 'busca') { busqueda = t.value; mostrados = PASO; clearTimeout(manejarInput.tm); manejarInput.tm = setTimeout(pintarLista, 250); }
  }

  function montar() {
    var main = document.querySelector('main'); if (!main) return;
    panel = document.createElement('div');
    panel.id = 'panel-edificios'; panel.className = 'panel';
    var cielo = document.createElement('div'); cielo.className = 'cielo-estrellado'; cielo.id = 'cielo-panel-edificios';
    panel.appendChild(cielo);
    contenido = document.createElement('div'); contenido.id = 'e-contenido'; panel.appendChild(contenido);
    main.appendChild(panel);
    if (typeof generarCieloEstrellado === 'function') generarCieloEstrellado('cielo-panel-edificios', 100);
    panel.addEventListener('click', manejarClick);
    panel.addEventListener('change', manejarChange);
    panel.addEventListener('input', manejarInput);
    // si se pulsa cualquier pestaña, este panel se oculta (los demás ya hacen su propia gestión de .active)
    document.querySelectorAll('.tab-btn').forEach(function (b) {
      b.addEventListener('click', function () { panel.classList.remove('active'); }, true);
    });
  }

  /* Leyenda del mapa exportado (cámara 📷): terra_layers.js lee window.GHISTORA_LEYENDA y añade lo que cada módulo dibuja en el mapa. */
  (window.GHISTORA_LEYENDA = window.GHISTORA_LEYENDA || []).push(function (mapa) {
    if (!capaMapa || !mapa || !mapa.hasLayer(capaMapa)) return [];
    var vista = mapa.getBounds(), pend = 0, ver = 0, res = 0, man = 0;
    capaMapa.eachLayer(function (l) {
      if (!l.feature) return;
      var b = l.getBounds ? l.getBounds() : (l.getLatLng ? L.latLngBounds([l.getLatLng(), l.getLatLng()]) : null);
      if (!b || !vista.intersects(b)) return;
      var p = l.feature.properties;
      if (p.manual) man++; else if (verificado(p.ref)) ver++; else pend++;
      if (resaltados[p.ref]) res++;
    });
    var o = [];
    if (pend) o.push({ nombre: 'Edificio que toca T500, pendiente de verificar', tipo: 'poligono', color: '#ff9f0a' });
    if (ver) o.push({ nombre: 'Edificio que toca T500, verificado por el ayuntamiento', tipo: 'poligono', color: '#30e36b' });
    if (man) o.push({ nombre: 'Edificio añadido por el ayuntamiento (no consta en Catastro)', tipo: 'punto', color: '#ff9f0a', borde: '#8a5a00' });
    if (res) o.push({ nombre: 'Edificio resaltado', tipo: 'contorno', color: '#00e5ff' });
    return o;
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { cargarDatos(); });
  else cargarDatos();
})();
