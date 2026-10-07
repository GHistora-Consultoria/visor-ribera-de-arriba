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
  var MAX_FOTOS = 6;
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
  var datos = null, cargando = false, errorDatos = '', esperando = [];
  function cargarDatos(cb) {
    if (datos) return cb && cb();
    if (cb) esperando.push(cb);
    if (cargando) return;
    cargando = true;
    fetch(URL_DATOS + '?v=' + Date.now()).then(function (resp) {
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return resp.json();
    }).then(function (j) {
      datos = (j.features || []).slice().sort(function (a, b) {
        var ca = a.properties.complejo || 'ZZ', cb2 = b.properties.complejo || 'ZZ';
        return ca < cb2 ? -1 : ca > cb2 ? 1 : (b.properties.huella_m2 - a.properties.huella_m2);
      });
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
    var n = datos.length, ok = datos.filter(function (f) { return verificado(f.properties.ref); }).length;
    v.textContent = n + ' edificios';
    s.textContent = 'tocan la zona inundable T500; ' + ok + ' verificados por el ayuntamiento (en este navegador)';
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
    if (p.T10) h += '<span class="e-chip e-t10">Toca T10 (frecuente)</span>';
    if (p.T100) h += '<span class="e-chip e-t100">Toca T100</span>';
    h += '<span class="e-chip e-t500">Toca T500' + (p.pct_T500 != null ? ' · ' + num(p.pct_T500, 0) + ' % de la huella' : '') + '</span>';
    if (p.ZFP) h += '<span class="e-chip e-zfp">Toca zona de flujo preferente</span>';
    if (p.suelo) h += '<span class="e-chip">Suelo: ' + esc(p.suelo) + '</span>';
    h += '<span class="e-chip">Huella: ' + num(p.huella_m2, 0) + ' m²</span>';
    h += '<span class="e-chip" title="Estado de conservación según Catastro (INSPIRE), no si está ocupado">Estado: ' + esc(p.estado) + '</span>';
    return h;
  }
  function bloqueCatastro(p) {
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
    return h + '</div>';
  }
  function bloqueOsm(p) {
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
    if (x.fotos.length < MAX_FOTOS) h += '<label class="e-fotobtn">📷 Añadir foto<input type="file" accept="image/*" multiple data-accion="foto-add" data-ref="' + ref + '" style="display:none"></label>';
    return h + '</div></div></div>';
  }
  function insignias(ref, p) {
    return (verificado(ref) ? '<span class="e-ins e-ins-ok">✔ Verificado por el ayuntamiento</span>' : '<span class="e-ins e-ins-no">⏳ Pendiente de verificar</span>') +
      (p.cat_uso ? '<span class="e-ins e-ins-cx">Catastro: ' + esc(p.cat_uso) + '</span>' : '');
  }
  function tarjeta(f) {
    var p = f.properties, ref = esc(p.ref);
    return '<div class="e-item' + (verificado(p.ref) ? ' e-ok' : '') + '" data-ref="' + ref + '">' +
      '<h4>' + (p.enlace ? '<a href="' + esc(p.enlace) + '" target="_blank" rel="noopener">' + ref + '</a>' : ref) +
      (p.complejo ? ' · complejo ' + esc(p.complejo) : '') + '<span class="e-ins-lugar" data-ref="' + ref + '">' + insignias(p.ref, p) + '</span></h4>' +
      '<div class="e-chips">' + chips(p) + '</div>' + bloqueCatastro(p) + bloqueOsm(p) + bloqueAyto(p) +
      '<button type="button" data-accion="mapa" data-ref="' + ref + '">🗺️ Ver en el mapa</button></div>';
  }

  /* ---------- panel ---------- */
  var panel, contenido, filtroEstado = 'Todos', filtroZona = 'Todas', busqueda = '';
  function pasaFiltro(f) {
    var p = f.properties;
    if (filtroEstado === 'Pendientes' && verificado(p.ref)) return false;
    if (filtroEstado === 'Verificados' && !verificado(p.ref)) return false;
    if (filtroZona === 'T10' && !p.T10) return false;
    if (filtroZona === 'T100' && !p.T100) return false;
    if (filtroZona === 'ZFP' && !p.ZFP) return false;
    if (filtroZona === 'Sin uso en Catastro' && p.cat_uso) return false;
    if (busqueda) {
      var x = reg[p.ref] || {};
      var t = [p.ref, p.complejo, p.cat_uso, p.cat_destino, p.cat_dir, p.osm_cat, p.osm_nombre, x.tipo, x.detalle, x.notas].join(' ').toLowerCase();
      if (t.indexOf(busqueda.toLowerCase()) < 0) return false;
    }
    return true;
  }
  function resumenHTML() {
    var n = datos.length, ok = datos.filter(function (f) { return verificado(f.properties.ref); }).length;
    var cx = datos.filter(function (f) { return f.properties.cat_uso; }).length;
    var t10 = datos.filter(function (f) { return f.properties.T10; }).length;
    var zf = datos.filter(function (f) { return f.properties.ZFP; }).length;
    function c(v, t) { return '<div class="e-caja"><b>' + v + '</b><span>' + t + '</span></div>'; }
    return c(n, 'edificios en la lista') + c(ok + ' de ' + n, 'verificados por el ayuntamiento') + c(cx, 'con uso en la ficha de Catastro') + c(t10, 'tocan T10 (inundación frecuente)') + c(zf, 'tocan la zona de flujo preferente');
  }
  function explicacionHTML() {
    return '<details class="e-expl" open><summary>¿Qué es esta lista y cómo leerla?</summary>' +
      '<ul><li><b>Qué incluye.</b> Edificios del Catastro de uso «servicios públicos», sin uso asignado o con una pista de OpenStreetMap, cuya huella toca la zona inundable de baja probabilidad (T500) del Ministerio. No incluye todavía los edificios de uso comercial o industrial, ni las viviendas.</li>' +
      '<li><b>«Toca» no es «está afectado».</b> Quiere decir que una parte de la huella del edificio cae dentro de la zona; el porcentaje indica cuánta. Que un edificio toque la zona no dice nada sobre su vulnerabilidad real.</li>' +
      '<li><b>Tres fuentes, tres colores.</b> En azul, lo que dice la ficha de <b>Catastro</b> (oficial). En morado, la <b>pista de OpenStreetMap</b> (no oficial, solo para orientar). En verde, lo que <b>comprueba y escribe el ayuntamiento</b>.</li>' +
      '<li><b>Por qué debe completarlo el ayuntamiento.</b> El proyecto de Real Decreto (sin aprobar) pide identificar «edificios públicos, equipamientos básicos y zonas comerciales» en zona inundable (art. 23.2.b), pero no define qué es un «equipamiento básico». Cita ejemplos (hospitales, centros escolares o sanitarios, residencias, centros deportivos cubiertos, parques de bomberos…; y, como servicios públicos esenciales, también centros deportivos descubiertos, depuradoras e instalaciones de Protección Civil). Decidir en cuál encaja cada edificio es una comprobación que hace quien lo conoce.</li>' +
      '<li><b>Dónde se guarda lo que escribas.</b> Solo en este navegador y en este ordenador. Para conservarlo o pasarlo a otro equipo, usa los botones de exportar. Si se borran los datos del navegador, se pierde.</li>' +
      '<li><b>Aviso.</b> Esto no sustituye al informe de la Confederación Hidrográfica del Cantábrico ni a un análisis de riesgo.</li></ul></details>';
  }
  function barraHTML() {
    function op(l, a) { return l.map(function (o) { return '<option' + (o === a ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join(''); }
    return '<div class="e-barra"><select data-filtro="estado">' + op(['Todos', 'Pendientes', 'Verificados'], filtroEstado) + '</select>' +
      '<select data-filtro="zona">' + op(['Todas', 'T10', 'T100', 'ZFP', 'Sin uso en Catastro'], filtroZona) + '</select>' +
      '<input type="search" data-filtro="busca" placeholder="Buscar por referencia, uso, nombre…" value="' + esc(busqueda) + '"></div>' +
      '<div class="e-barra"><button type="button" class="e-primario" data-accion="csv">⬇️ Exportar CSV</button>' +
      '<button type="button" data-accion="geojson">⬇️ Exportar GeoJSON</button>' +
      '<button type="button" data-accion="completa">💾 Copia completa con fotos</button>' +
      '<label class="e-fotobtn" style="margin:0;">📂 Importar copia<input type="file" accept=".json,application/json" data-accion="importar" style="display:none"></label>' +
      '<button type="button" data-accion="mapa-todos">🗺️ Ver todos en el mapa</button></div>';
  }
  function pintarLista() {
    if (!panel) return;
    var cont = document.getElementById('e-lista');
    if (!cont) return pintar();
    var vis = datos.filter(pasaFiltro);
    cont.innerHTML = vis.length ? vis.map(tarjeta).join('') : '<p class="e-sub">Ningún edificio con estos filtros.</p>';
    var rs = document.getElementById('e-resumen'); if (rs) rs.innerHTML = resumenHTML();
    cargarMiniaturas(); actualizarCaja();
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
    h += explicacionHTML() + '<div class="e-cajas" id="e-resumen">' + resumenHTML() + '</div>' + barraHTML() + '<div id="e-lista"></div></div>';
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
    if (ref) { busqueda = ref; filtroEstado = 'Todos'; filtroZona = 'Todas'; }
    pintar();
    if (!datos) cargarDatos(function () { pintar(); });
  };

  /* ---------- mapa ---------- */
  var capaMapa = null;
  function getMapa() { return window.mapaTerraPropio || null; }
  function estiloDe(f) {
    var ok = verificado(f.properties.ref);
    return { color: ok ? '#30e36b' : '#ff9f0a', weight: 3, fillColor: ok ? '#30e36b' : '#ff9f0a', fillOpacity: 0.35 };
  }
  function popupDe(f) {
    var p = f.properties, d = document.createElement('div'), x = reg[p.ref] || {};
    d.innerHTML = '<b>' + esc(p.ref) + '</b>' + (p.complejo ? ' · complejo ' + esc(p.complejo) : '') +
      '<br>Catastro: ' + esc(p.cat_uso || 'sin uso en la ficha') +
      (verificado(p.ref) ? '<br>Ayuntamiento: <b>' + esc(x.tipo) + '</b>' : '<br>⏳ Pendiente de verificar') +
      '<br>' + (p.T10 ? 'Toca T10 · ' : '') + (p.T100 ? 'Toca T100 · ' : '') + 'Toca T500' + (p.ZFP ? ' · Toca flujo preferente' : '') +
      '<br><button type="button" class="e-pop-a" style="margin-top:8px;padding:5px 10px;cursor:pointer;">Abrir ficha</button> ' +
      '<button type="button" class="e-pop-q" style="margin-top:8px;padding:5px 10px;cursor:pointer;">Quitar del mapa</button>';
    d.querySelector('.e-pop-a').addEventListener('click', function () { window.abrirEdificios(p.ref); });
    d.querySelector('.e-pop-q').addEventListener('click', quitarDelMapa);
    return d;
  }
  function quitarDelMapa() { if (capaMapa && getMapa()) { getMapa().removeLayer(capaMapa); } capaMapa = null; }
  function verEnMapa(ref) {
    var mapa = getMapa();
    if (!mapa || typeof L === 'undefined') { alert('El mapa todavía no está listo. Prueba de nuevo en unos segundos.'); return; }
    if (!datos) return;
    quitarDelMapa();
    capaMapa = L.geoJSON({ type: 'FeatureCollection', features: datos }, {
      style: estiloDe,
      onEachFeature: function (f, lyr) { lyr.bindPopup(function () { return popupDe(f); }, { minWidth: 220, maxWidth: 300 }); }
    }).addTo(mapa);
    irATab('panel-calle');
    setTimeout(function () {
      try { mapa.invalidateSize(); } catch (e) {}
      var objetivo = null;
      if (ref) capaMapa.eachLayer(function (l) { if (l.feature.properties.ref === ref) objetivo = l; });
      if (objetivo) { mapa.fitBounds(objetivo.getBounds(), { maxZoom: 19, padding: [60, 60] }); objetivo.openPopup(); }
      else mapa.fitBounds(capaMapa.getBounds(), { maxZoom: 16, padding: [40, 40] });
    }, 250);
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
    return { referencia_catastral: p.ref, complejo: p.complejo, uso_catastro: p.cat_uso, destino_catastro: p.cat_destino, superficie_catastro_m2: p.cat_sup_m2,
      anio_catastro: p.cat_anio, direccion_catastro: p.cat_dir, uso_en_datos_de_edificios: p.uso_inspire, estado_conservacion: p.estado, huella_m2: p.huella_m2,
      toca_T10: p.T10 ? 'sí' : 'no', toca_T100: p.T100 ? 'sí' : 'no', toca_T500: p.T500 ? 'sí' : 'no', pct_huella_T500: p.pct_T500,
      toca_zona_flujo_preferente: p.ZFP ? 'sí' : 'no', clase_suelo: p.suelo, pista_osm_no_oficial: o.cats, nombre_osm: o.noms,
      ayto_que_es: x.tipo || PENDIENTE, ayto_detalle: x.detalle || '', ayto_confirma: x.por || '', ayto_fecha: x.fecha || '', ayto_notas: x.notas || '',
      n_fotos: (x.fotos || []).length, enlace_catastro: p.enlace };
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
      var refs = Object.keys(d.registros);
      if (!confirm('Se van a cargar los datos de ' + refs.length + ' edificio(s). Si ya tenías datos de esos mismos edificios en este navegador, se sustituirán. ¿Continuar?')) return;
      var fotosD = (d.fotos && typeof d.fotos === 'object') ? d.fotos : {}, pendientes = [], fallos = 0;
      refs.forEach(function (ref) {
        var s = d.registros[ref] || {};
        var fotos = (Array.isArray(s.fotos) ? s.fotos : []).filter(function (f) { return f && typeof f.id === 'string' && typeof fotosD[f.id] === 'string'; });
        fotos.forEach(function (f) { pendientes.push({ id: f.id, ref: ref }); });
        reg[ref] = { tipo: String(s.tipo || ''), detalle: String(s.detalle || ''), por: String(s.por || ''), fecha: String(s.fecha || ''), notas: String(s.notas || ''), fotos: fotos };
      });
      guardar();
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
    else if (acc === 'mapa') verEnMapa(ref);
    else if (acc === 'mapa-todos') verEnMapa(null);
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
    if (capaMapa) capaMapa.eachLayer(function (l) { if (l.feature && l.feature.properties.ref === ref) l.setStyle(estiloDe(l.feature)); });
  }
  function manejarChange(e) {
    var t = e.target, fl = t.getAttribute('data-filtro'), campo = t.getAttribute('data-campo'), acc = t.getAttribute('data-accion');
    if (fl) {
      if (fl === 'estado') filtroEstado = t.value; else if (fl === 'zona') filtroZona = t.value; else busqueda = t.value;
      pintarLista(); return;
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
    if (t.getAttribute('data-filtro') === 'busca') { busqueda = t.value; clearTimeout(manejarInput.tm); manejarInput.tm = setTimeout(pintarLista, 250); }
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { cargarDatos(); });
  else cargarDatos();
})();
