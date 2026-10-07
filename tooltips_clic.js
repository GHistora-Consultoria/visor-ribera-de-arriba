/* tooltips_clic.js — La información de las capas del mapa (suelo urbano, urbanizable, no urbanizable, parcelas…) aparece
   al HACER CLIC en el elemento, no al pasar el ratón por encima. Así no queda ninguna etiqueta suelta al exportar el mapa
   con la cámara 📷, y la persona decide cuándo ver y cuándo cerrar la información.
   Respeta: etiquetas permanentes, marcadores, y capas que ya tienen su propia ventana al clic. */
(function () {
  'use strict';
  function tieneVentanaHija(capa) {
    var hay = false;
    if (typeof capa.eachLayer === 'function') capa.eachLayer(function (l) { if (l._popup) hay = true; });
    return hay;
  }
  function convertir(capa) {
    if (!capa || capa._ghTooltipRevisado || typeof capa.getTooltip !== 'function') return;
    var tt = capa.getTooltip();
    if (!tt) return;
    capa._ghTooltipRevisado = true;
    if (tt.options && tt.options.permanent) return;
    if (L.Marker && capa instanceof L.Marker) return;
    if (capa._popup || tieneVentanaHija(capa)) return;
    var contenido = tt._content;
    if (contenido == null) return;
    capa.unbindTooltip();
    capa.bindPopup(contenido, { maxWidth: 380, autoPanPadding: [30, 30] });
  }
  function iniciar(mapa) {
    mapa.eachLayer(convertir);
    mapa.on('layeradd', function (e) { convertir(e.layer); });
  }
  var intentos = 0, t = setInterval(function () {
    var m = window.mapaTerraPropio;
    if (m && typeof L !== 'undefined' && typeof m.eachLayer === 'function') { clearInterval(t); iniciar(m); }
    else if (++intentos > 300) clearInterval(t);
  }, 300);
})();
