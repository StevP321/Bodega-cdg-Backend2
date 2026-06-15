// =============================================================
// BODEGA CDG - FRONTEND CON BACKEND REAL (Supabase + Render)
// =============================================================

// CONFIG: cambiar la URL al deploy de Render
const API_BASE = window.location.origin;

// Usuario activo (en producción vendría de autenticación real)
var ROL = 'auditor'; // 'operador' o 'auditor'
var USUARIO = localStorage.getItem('bodega_usuario') || 'auditor1';
document.getElementById('tuser').textContent = USUARIO;

// Estado global en memoria (sincronizado con Supabase)
var DB = {
  catalogo: [],
  licencias_bolson: [],
  capturas: [],
  auditorias: [],
  teorico: [],
  pts: [],
  pt_skus: [],
  ptActivo: null,
  lbActiva: null,
  filtroTarima: null
};

// =============================================================
// UTILS
// =============================================================
function hoy() { return new Date().toISOString().split('T')[0]; }
function fmtF(f) {
  if (!f) return '-';
  var p = f.split('-');
  if (p.length < 3) return f;
  return p[2] + '/' + p[1] + '/' + p[0];
}
function fmtDT() {
  var d = new Date();
  return d.toLocaleDateString('es') + ' ' + d.toLocaleTimeString('es', {hour:'2-digit',minute:'2-digit'});
}

function badge(est) {
  var mp = {activa:'v-g',activo:'v-g',auditado:'v-g',cuadrado:'v-g',finalizado:'v-b',en_proceso:'v-b',no_auditado:'v-a',pendiente:'v-a',sobrante:'v-a',faltante:'v-r',borrado:'v-n',borrador:'v-n',creado:'v-n',incluido:'v-b'};
  var ml = {no_auditado:'No Auditado',en_proceso:'En Proceso',activo:'Activo',finalizado:'Finalizado',borrador:'Borrador',cuadrado:'Cuadrado',faltante:'Faltante',sobrante:'Sobrante',auditado:'Auditado',creado:'Creado',incluido:'Incluido'};
  return '<span class="badge ' + (mp[est]||'v-n') + '">' + (ml[est]||est) + '</span>';
}

function flash(id, cls, txt, ms) {
  var el = typeof id === 'string' ? document.getElementById(id) : id;
  if (!el) return;
  el.innerHTML = '<div class="alert ' + cls + '">' + txt + '</div>';
  if (ms) setTimeout(function() { el.innerHTML = ''; }, ms);
}

function confirm2(titulo, msg, siTxt, siCls) {
  siTxt = siTxt || 'Confirmar'; siCls = siCls || 'bd';
  return new Promise(function(resolve) {
    document.getElementById('mod-c-t').textContent = titulo;
    document.getElementById('mod-c-m').textContent = msg;
    var si = document.getElementById('btn-c-si');
    var no = document.getElementById('btn-c-no');
    si.className = 'btn ' + siCls; si.textContent = siTxt;
    document.getElementById('mod-c').classList.remove('h');
    function done(v) {
      document.getElementById('mod-c').classList.add('h');
      var si2 = si.cloneNode(true); var no2 = no.cloneNode(true);
      si.parentNode.replaceChild(si2, si); no.parentNode.replaceChild(no2, no);
      resolve(v);
    }
    document.getElementById('btn-c-si').addEventListener('click', function() { done(true); }, {once:true});
    document.getElementById('btn-c-no').addEventListener('click', function() { done(false); }, {once:true});
  });
}

// =============================================================
// API CALLS
// =============================================================
async function api(path, opts) {
  opts = opts || {};
  try {
    const res = await fetch(API_BASE + path, {
      method: opts.method || 'GET',
      headers: opts.body ? {'Content-Type':'application/json'} : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    return await res.json();
  } catch(e) {
    return { ok: false, error: 'Sin conexión al servidor' };
  }
}

async function apiForm(path, formData) {
  try {
    const res = await fetch(API_BASE + path, { method: 'POST', body: formData });
    return await res.json();
  } catch(e) {
    return { ok: false, error: 'Sin conexión al servidor' };
  }
}

// =============================================================
// SYNC INICIAL
// =============================================================
async function syncInicial() {
  const loader = document.getElementById('sync-loader');
  if (loader) loader.style.display = 'flex';
  const r = await api('/api/sync');
  if (loader) loader.style.display = 'none';
  if (!r.ok) {
    alert('No se pudo conectar al servidor. Verifica la configuración.');
    return;
  }
  DB.catalogo = r.catalogo || [];
  DB.licencias_bolson = r.licencias_bolson || [];
  DB.capturas = r.capturas || [];
  DB.auditorias = r.auditorias || [];
  DB.teorico = r.teorico || [];
  DB.pts = r.pts || [];
  DB.pt_skus = r.pt_skus || [];
}

// =============================================================
// BÚSQUEDA EN CATÁLOGO
// =============================================================
function buscarCat(val) {
  var v = (val||'').trim().toUpperCase();
  if (!v) return null;
  for (var i = 0; i < DB.catalogo.length; i++) {
    var r = DB.catalogo[i];
    if ((r.barcode||'').toUpperCase() === v || (r.sku||'').toUpperCase() === v) return r;
  }
  return null;
}

function buscarTeo(sku) {
  var v = (sku||'').trim().toUpperCase();
  for (var i = 0; i < DB.teorico.length; i++) {
    if ((DB.teorico[i].sku||'').toUpperCase() === v) return DB.teorico[i];
  }
  return null;
}

function getPT() {
  if (!DB.ptActivo) return null;
  for (var i = 0; i < DB.pts.length; i++) {
    if (DB.pts[i].id === DB.ptActivo) return DB.pts[i];
  }
  return null;
}

function getSkusPT(ptId) {
  return DB.pt_skus.filter(function(s) { return s.pt_id === ptId; });
}

// =============================================================
// NAVEGACIÓN
// =============================================================
function showView(id) {
  document.querySelectorAll('.view').forEach(function(v) { v.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
}

document.getElementById('mc-cap').addEventListener('click', function() {
  showView('view-cap'); renderLbs();
});
document.getElementById('mc-aud').addEventListener('click', function() {
  showView('view-aud'); renderTarimas();
});
document.getElementById('mc-cat').addEventListener('click', function() {
  showView('view-cat'); renderCatalogo();
});
document.getElementById('back-cap').addEventListener('click', function() { showView('view-menu'); });
document.getElementById('back-aud').addEventListener('click', function() { showView('view-menu'); });
document.getElementById('back-cat').addEventListener('click', function() { showView('view-menu'); });

function goTab(name) {
  document.querySelectorAll('.tbar .tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.panel').forEach(function(p) { p.classList.remove('active'); });
  document.querySelector('.tab[data-tab="'+name+'"]').classList.add('active');
  document.querySelector('.panel[data-panel="'+name+'"]').classList.add('active');
  var loaders = {tarimas:renderTarimas, detalle:renderDetalle, control:renderControl, papel:renderPapel};
  if (loaders[name]) loaders[name]();
}
document.querySelectorAll('.tbar .tab').forEach(function(btn) {
  btn.addEventListener('click', function() { goTab(btn.dataset.tab); });
});

// =============================================================
// CATÁLOGO BARRA-SKU
// =============================================================
document.getElementById('cat-q').addEventListener('input', renderCatalogo);

function renderCatalogo() {
  var q = document.getElementById('cat-q').value.toLowerCase();
  var rows = DB.catalogo.filter(function(r) {
    return !q || (r.barcode||'').toLowerCase().indexOf(q) >= 0
               || (r.sku||'').toLowerCase().indexOf(q) >= 0
               || (r.descripcion||'').toLowerCase().indexOf(q) >= 0;
  });
  var tb = document.getElementById('tb-cat');
  if (!rows.length) { tb.innerHTML = '<tr><td colspan="3" class="te">Sin registros. Carga un Excel.</td></tr>'; return; }
  var h = '';
  rows.slice(0,500).forEach(function(r) {
    h += '<tr><td class="mono">'+(r.barcode||'-')+'</td><td><b class="mono">'+(r.sku||'-')+'</b></td><td>'+(r.descripcion||'-')+'</td></tr>';
  });
  if (rows.length > 500) h += '<tr><td colspan="3" class="te muted">...y '+(rows.length-500)+' más</td></tr>';
  tb.innerHTML = h;
}

document.getElementById('inp-cat').addEventListener('change', async function(e) {
  var file = e.target.files[0]; if (!file) return;
  flash('cat-msg', 'al-i', '<span class="spin">⟳</span> Subiendo catálogo...', 0);
  var fd = new FormData(); fd.append('archivo', file);
  var r = await apiForm('/api/catalogo/subir', fd);
  if (r.ok && r.data) {
    DB.catalogo = r.data;
    flash('cat-msg', 'al-s', 'Catálogo cargado: ' + r.total + ' registros', 5000);
    renderCatalogo();
  } else {
    flash('cat-msg', 'al-e', 'Error: ' + (r.error || 'desconocido'), 5000);
  }
  e.target.value = '';
});

// =============================================================
// CAPTURA DE TARIMA - LICENCIAS BOLSÓN
// =============================================================
document.getElementById('lb-fecha').value = hoy();

function renderLbs() {
  var tb = document.getElementById('tb-lb');
  if (!DB.licencias_bolson.length) { tb.innerHTML = '<tr><td colspan="4" class="te">Sin licencias. Crea una arriba.</td></tr>'; return; }
  var h = '';
  DB.licencias_bolson.forEach(function(lb) {
    var skuCount = DB.capturas.filter(function(c) { return c.licencia_bolson_id === lb.id; }).length;
    h += '<tr>';
    h += '<td><b class="mono">'+lb.licencia+'</b></td>';
    h += '<td>'+fmtF(lb.fecha)+'</td>';
    h += '<td>'+skuCount+'</td>';
    h += '<td><div class="brow">';
    h += '<button class="btn bp xs" data-id="'+lb.id+'" data-a="abrir">'+(skuCount>0?'Editar':'Empezar')+'</button>';
    h += '<button class="btn bd xs" data-id="'+lb.id+'" data-a="borrar">Borrar</button>';
    h += '</div></td></tr>';
  });
  tb.innerHTML = h;
  tb.querySelectorAll('[data-a=abrir]').forEach(function(b) {
    b.addEventListener('click', function() { abrirLb(b.dataset.id); });
  });
  tb.querySelectorAll('[data-a=borrar]').forEach(function(b) {
    b.addEventListener('click', async function() {
      var lb = DB.licencias_bolson.find(function(l){return l.id==b.dataset.id;});
      var ok = await confirm2('Borrar licencia bolsón', 'Eliminar la licencia '+lb.licencia+' y todos sus registros?');
      if (!ok) return;
      flash('lb-msg','al-i','<span class="spin">⟳</span> Borrando...',0);
      var r = await api('/api/licencias-bolson/'+b.dataset.id, {method:'DELETE'});
      if (r.ok) {
        DB.licencias_bolson = DB.licencias_bolson.filter(function(l){return l.id!=b.dataset.id;});
        DB.capturas = DB.capturas.filter(function(c){return c.licencia_bolson_id!=b.dataset.id;});
        flash('lb-msg','al-s','Licencia borrada',3000);
        renderLbs();
      } else {
        flash('lb-msg','al-e','Error: '+(r.error||'desconocido'),4000);
      }
    });
  });
}

document.getElementById('btn-crear-lb').addEventListener('click', async function() {
  var cod = document.getElementById('lb-cod').value.trim();
  var fecha = document.getElementById('lb-fecha').value;
  if (!cod) { flash('lb-msg','al-w','Ingresa el código de la licencia bolsón',3000); return; }
  if (DB.licencias_bolson.find(function(l){return l.licencia===cod;})) {
    flash('lb-msg','al-w','Ya existe una licencia con ese código',3000); return;
  }
  flash('lb-msg','al-i','<span class="spin">⟳</span> Guardando...',0);
  var r = await api('/api/licencias-bolson', {method:'POST', body:{licencia:cod, fecha:fecha||hoy(), creado_por:USUARIO}});
  if (r.ok) {
    DB.licencias_bolson.unshift(r.data);
    document.getElementById('lb-cod').value = '';
    flash('lb-msg','al-s','Licencia creada: '+cod,3000);
    renderLbs();
  } else {
    flash('lb-msg','al-e','Error: '+(r.error||'desconocido'),4000);
  }
});

function abrirLb(id) {
  var lb = DB.licencias_bolson.find(function(l){return l.id==id;});
  if (!lb) return;
  DB.lbActiva = lb;
  document.getElementById('cap-lb-titulo').textContent = 'Licencia: '+lb.licencia;
  document.getElementById('cap-lb-sub').textContent = 'Fecha: '+fmtF(lb.fecha)+'  -  Operador: '+USUARIO;
  document.getElementById('cap-admin').classList.add('h');
  document.getElementById('cap-entrada').classList.remove('h');
  renderCapSkus();
}

document.getElementById('btn-cap-volver').addEventListener('click', function() {
  document.getElementById('cap-entrada').classList.add('h');
  document.getElementById('cap-admin').classList.remove('h');
  DB.lbActiva = null; renderLbs();
});

document.getElementById('cap-barra').addEventListener('input', function(e) {
  var found = buscarCat(e.target.value);
  if (found) { document.getElementById('cap-sku').value=found.sku||''; document.getElementById('cap-desc').value=found.descripcion||''; }
});
document.getElementById('cap-sku').addEventListener('blur', function(e) {
  var found = buscarCat(e.target.value);
  if (found) document.getElementById('cap-desc').value=found.descripcion||'';
});
document.getElementById('cap-sku').addEventListener('keydown', function(e) {
  if (e.key==='Enter') document.getElementById('cap-qty').focus();
});

function renderCapSkus() {
  var tb = document.getElementById('tb-cap');
  var caps = DB.lbActiva ? DB.capturas.filter(function(c){return c.licencia_bolson_id===DB.lbActiva.id;}) : [];
  if (!caps.length) { tb.innerHTML='<tr><td colspan="7" class="te">Sin registros aún</td></tr>'; return; }
  var h = '';
  caps.forEach(function(s) {
    var dt = s.created_at ? new Date(s.created_at).toLocaleString('es') : '-';
    h += '<tr>';
    h += '<td><b>'+s.tarima+'</b></td>';
    h += '<td><span class="mono">'+s.sku+'</span></td>';
    h += '<td>'+(s.descripcion||'-')+'</td>';
    h += '<td>'+s.cantidad+'</td>';
    h += '<td>'+s.capturado_por+'</td>';
    h += '<td>'+dt+'</td>';
    h += '<td>'+(s.capturado_por===USUARIO
      ? '<button class="btn bd xs" data-id="'+s.id+'" data-a="del-c">Borrar</button>'
      : '<span class="muted" style="font-size:11px;">Sin permiso</span>')+'</td></tr>';
  });
  tb.innerHTML = h;
  tb.querySelectorAll('[data-a=del-c]').forEach(function(b) {
    b.addEventListener('click', async function() {
      var ok = await confirm2('Borrar línea','Eliminar este registro de captura?');
      if (!ok) return;
      var r = await api('/api/capturas/'+b.dataset.id, {method:'DELETE', body:{usuario:USUARIO}});
      if (r.ok) {
        DB.capturas = DB.capturas.filter(function(c){return c.id!=b.dataset.id;});
        renderCapSkus();
      } else { alert('Error: '+(r.error||'desconocido')); }
    });
  });
}

document.getElementById('btn-cap-add').addEventListener('click', async function() {
  if (!DB.lbActiva) return;
  var sku = document.getElementById('cap-sku').value.trim().toUpperCase();
  var desc = document.getElementById('cap-desc').value.trim();
  var qty = parseFloat(document.getElementById('cap-qty').value)||0;
  var tar = document.getElementById('cap-tarima').value.trim().toUpperCase();
  if (!sku) { flash('cap-add-msg','al-w','Ingresa el SKU',2000); return; }
  if (!tar) { flash('cap-add-msg','al-w','Ingresa el correlativo de tarima (ej: A01)',2000); return; }
  flash('cap-add-msg','al-i','<span class="spin">⟳</span> Guardando...',0);
  var r = await api('/api/capturas', {method:'POST', body:{
    licencia_bolson_id: DB.lbActiva.id,
    sku, descripcion: desc, cantidad: qty, tarima: tar, capturado_por: USUARIO
  }});
  if (r.ok) {
    DB.capturas.push(r.data);
    ['cap-barra','cap-sku','cap-desc','cap-qty','cap-tarima'].forEach(function(id){document.getElementById(id).value='';});
    flash('cap-add-msg','al-s','SKU '+sku+' agregado a tarima '+tar,2000);
    renderCapSkus();
  } else {
    flash('cap-add-msg','al-e','Error: '+(r.error||'desconocido'),4000);
  }
});

// =============================================================
// TAB 1 - TARIMAS
// =============================================================
function buildTarimasRows() {
  var rows = [];
  DB.licencias_bolson.forEach(function(lb) {
    var caps = DB.capturas.filter(function(c){return c.licencia_bolson_id===lb.id;});
    var byTar = {};
    caps.forEach(function(s) {
      if (!byTar[s.tarima]) byTar[s.tarima]={tarima:s.tarima,caps:[],ops:[]};
      byTar[s.tarima].caps.push(s);
      if (byTar[s.tarima].ops.indexOf(s.capturado_por)<0) byTar[s.tarima].ops.push(s.capturado_por);
    });
    Object.values(byTar).forEach(function(t) {
      var unicos = [...new Set(t.caps.map(function(c){return c.sku;}))];
      var auds = DB.auditorias.filter(function(a){
        return a.licencia_bolson_id===lb.id && a.tarima===t.tarima && (a.estado==='auditado'||a.estado==='cuadrado'||a.estado==='faltante'||a.estado==='sobrante');
      });
      var lichCount = DB.pts.filter(function(p){return p.lic_hija && p.estado!=='borrado';}).length;
      rows.push({
        lb_id:lb.id, licencia:lb.licencia, fecha:lb.fecha, creado_por:lb.creado_por,
        skus_unicos:unicos.length, auditados:auds.length, lic_hijas:lichCount,
        tarima:t.tarima, lineas:t.caps.length, cant_sku:unicos.length, operador:t.ops.join(', ')
      });
    });
  });
  return rows;
}

function renderTarimas() {
  var data = buildTarimasRows();
  var qLb = document.getElementById('ft-lb').value.toLowerCase();
  var qFe = document.getElementById('ft-fecha').value;
  var qTa = document.getElementById('ft-tar').value.toLowerCase();
  var rows = data.filter(function(r) {
    if (qLb && r.licencia.toLowerCase().indexOf(qLb)<0) return false;
    if (qFe && r.fecha!==qFe) return false;
    if (qTa && r.tarima.toLowerCase().indexOf(qTa)<0) return false;
    return true;
  });
  var tb = document.getElementById('tb-tar');
  if (!rows.length) { tb.innerHTML='<tr><td colspan="11" class="te">Sin datos. Captura tarimas primero.</td></tr>'; return; }
  var h = '';
  rows.forEach(function(r) {
    h += '<tr>';
    h += '<td><span class="mono">'+r.licencia+'</span></td>';
    h += '<td>'+fmtF(r.fecha)+'</td>';
    h += '<td>'+r.skus_unicos+'</td>';
    h += '<td><span class="badge '+(r.auditados>0?'v-g':'v-n')+'">'+r.auditados+'/'+r.skus_unicos+'</span></td>';
    h += '<td>'+r.lic_hijas+'</td>';
    h += '<td>'+r.creado_por+'</td>';
    h += '<td><b>'+r.tarima+'</b></td>';
    h += '<td>'+r.lineas+'</td>';
    h += '<td>'+r.cant_sku+'</td>';
    h += '<td>'+r.operador+'</td>';
    h += '<td><button class="btn bp xs" data-lb="'+r.lb_id+'" data-tar="'+r.tarima+'" data-a="auditar">Auditar</button></td>';
    h += '</tr>';
  });
  tb.innerHTML = h;
  tb.querySelectorAll('[data-a=auditar]').forEach(function(b) {
    b.addEventListener('click', function() {
      DB.filtroTarima = {lb_id: b.dataset.lb, tarima: b.dataset.tar};
      document.getElementById('fd-tar').value = b.dataset.tar;
      goTab('detalle');
    });
  });
}

['ft-lb','ft-fecha','ft-tar'].forEach(function(id){ document.getElementById(id).addEventListener('input', renderTarimas); });
document.getElementById('btn-ft-c').addEventListener('click', function() {
  ['ft-lb','ft-fecha','ft-tar'].forEach(function(id){document.getElementById(id).value='';});
  DB.filtroTarima=null; renderTarimas();
});
document.getElementById('btn-ref-tar').addEventListener('click', renderTarimas);

// =============================================================
// TAB 2 - DETALLE
// =============================================================
function calcEstDet(cap, fis) {
  var d = parseFloat(cap||0) - parseFloat(fis);
  if (d===0) return 'cuadrado';
  return d<0 ? 'faltante' : 'sobrante';
}

function renderDetalle() {
  var sub = document.getElementById('det-sub');
  var btnQF = document.getElementById('btn-det-qf');
  if (DB.filtroTarima) { sub.textContent='Filtrado por tarima: '+DB.filtroTarima.tarima; btnQF.classList.remove('h'); }
  else { sub.textContent='Todos los SKUs de las capturas activas'; btnQF.classList.add('h'); }

  var qLb = document.getElementById('fd-lb').value.toLowerCase();
  var qFe = document.getElementById('fd-fecha').value;
  var qTa = document.getElementById('fd-tar').value.toLowerCase();
  var qSk = document.getElementById('fd-sku').value.toLowerCase();

  // Construir filas desde capturas + auditorias
  var rows = DB.capturas.map(function(cap) {
    var lb = DB.licencias_bolson.find(function(l){return l.id===cap.licencia_bolson_id;});
    var aud = DB.auditorias.find(function(a){return a.captura_id===cap.id;});
    return {
      id: cap.id, lb_id: cap.licencia_bolson_id,
      licencia: lb ? lb.licencia : cap.licencia_bolson_id,
      fecha: lb ? lb.fecha : '',
      tarima: cap.tarima, sku: cap.sku, descripcion: cap.descripcion,
      cant_captura: cap.cantidad,
      fisico: aud ? aud.fisico : null,
      estado: aud ? aud.estado : 'pendiente',
      operador: cap.capturado_por,
      auditado_por: aud ? aud.auditado_por : null
    };
  }).filter(function(r) {
    if (DB.filtroTarima && (r.lb_id!=DB.filtroTarima.lb_id || r.tarima!==DB.filtroTarima.tarima)) return false;
    if (qLb && r.licencia.toLowerCase().indexOf(qLb)<0) return false;
    if (qFe && r.fecha!==qFe) return false;
    if (qTa && r.tarima.toLowerCase().indexOf(qTa)<0) return false;
    if (qSk && r.sku.toLowerCase().indexOf(qSk)<0) return false;
    return true;
  });

  var tb = document.getElementById('tb-det');
  if (!rows.length) { tb.innerHTML='<tr><td colspan="12" class="te">Sin resultados</td></tr>'; return; }
  var h = '';
  rows.forEach(function(r) {
    var aud = r.estado!=='pendiente';
    var fis = r.fisico!==null && r.fisico!==undefined ? r.fisico : '';
    var dif = fis!=='' ? parseFloat(r.cant_captura||0)-parseFloat(fis) : '';
    var dc = dif==='' ? '' : (dif>0?'dp':(dif<0?'dn':'dz'));
    var difTxt = dif==='' ? '-' : (dif>0?'+'+dif:''+dif);
    var estCalc = fis!=='' ? calcEstDet(r.cant_captura, fis) : r.estado;
    h += '<tr data-cid="'+r.id+'">';
    h += '<td><span class="mono">'+r.licencia+'</span></td>';
    h += '<td>'+fmtF(r.fecha)+'</td>';
    h += '<td>'+r.tarima+'</td>';
    h += '<td><b class="mono">'+r.sku+'</b></td>';
    h += '<td>'+(r.descripcion||'-')+'</td>';
    h += '<td>'+(r.cant_captura||0)+'</td>';
    h += '<td><input type="number" class="fis-inp" data-cid="'+r.id+'" value="'+(fis===''?'':fis)+'" min="0" step="1"'+(aud?' style="border-color:var(--green-bd)"':'')+'></td>';
    h += '<td class="'+dc+'">'+difTxt+'</td>';
    h += '<td>'+badge(estCalc||'pendiente')+'</td>';
    h += '<td>'+(r.operador||'-')+'</td>';
    h += '<td>'+(r.auditado_por||'-')+'</td>';
    h += '<td>';
    if (!aud) h += '<button class="btn bs xs btn-aud" data-cid="'+r.id+'">Auditar</button>';
    else h += '<button class="btn bd xs btn-anular" data-cid="'+r.id+'">Anular</button>';
    h += '</td></tr>';
  });
  tb.innerHTML = h;

  // Recalc en tiempo real
  tb.querySelectorAll('.fis-inp').forEach(function(inp) {
    inp.addEventListener('input', function(e) {
      var row = e.target.closest('tr');
      var cap = parseFloat(row.querySelector('td:nth-child(6)').textContent)||0;
      var fis2 = e.target.value!=='' ? parseFloat(e.target.value) : null;
      var dif2 = fis2!==null ? cap-fis2 : null;
      var dc2 = dif2===null?'':(dif2>0?'dp':(dif2<0?'dn':'dz'));
      var difCell = row.querySelector('td:nth-child(8)');
      difCell.className=dc2; difCell.textContent=dif2===null?'-':(dif2>0?'+'+dif2:''+dif2);
      row.querySelector('td:nth-child(9)').innerHTML=fis2!==null?badge(calcEstDet(cap,fis2)):badge('pendiente');
    });
  });

  tb.querySelectorAll('.btn-aud').forEach(function(b) {
    b.addEventListener('click', async function() {
      var row = b.closest('tr');
      var val = row.querySelector('.fis-inp').value;
      if (val==='') { alert('Ingresa el Físico s/Auditoría primero'); return; }
      var cap = DB.capturas.find(function(c){return c.id==b.dataset.cid;});
      if (!cap) return;
      var lb = DB.licencias_bolson.find(function(l){return l.id===cap.licencia_bolson_id;});
      var r = await api('/api/auditorias/auditar', {method:'POST', body:{
        captura_id: cap.id, fisico: parseFloat(val),
        auditado_por: USUARIO, licencia_bolson_id: cap.licencia_bolson_id,
        sku: cap.sku, descripcion: cap.descripcion, tarima: cap.tarima,
        cant_captura: cap.cantidad
      }});
      if (r.ok) {
        // Actualizar DB local
        var existing = DB.auditorias.findIndex(function(a){return a.captura_id===cap.id;});
        if (existing>=0) DB.auditorias[existing]=r.data;
        else DB.auditorias.push(r.data);
        // Auto-incluir en PT activo si faltante/sobrante
        if ((r.estado==='faltante'||r.estado==='sobrante') && DB.ptActivo) {
          var pt = getPT();
          if (pt) {
            var yaEn = DB.pt_skus.find(function(s){return s.pt_id===pt.id && s.sku===cap.sku;});
            if (!yaEn) {
              var teo = buscarTeo(cap.sku);
              var res2 = await api('/api/pt/'+pt.id+'/skus', {method:'POST', body:{
                sku:cap.sku, descripcion:cap.descripcion, fisico:parseFloat(val),
                tarima:cap.tarima, estado:r.estado,
                cant_952: teo ? parseFloat(teo.cant952||0) : 0,
                origen:'incluido', capturado_por:USUARIO
              }});
              if (res2.ok) DB.pt_skus.push(res2.data);
            }
          }
        }
        renderDetalle();
      } else { alert('Error: '+(r.error||'desconocido')); }
    });
  });

  tb.querySelectorAll('.btn-anular').forEach(function(b) {
    b.addEventListener('click', async function() {
      var ok = await confirm2('Anular auditoría','Anular la auditoría de este SKU?','Anular');
      if (!ok) return;
      var r = await api('/api/auditorias/'+b.dataset.cid, {method:'DELETE'});
      if (r.ok) {
        DB.auditorias = DB.auditorias.filter(function(a){return a.captura_id!=b.dataset.cid;});
        renderDetalle();
      } else { alert('Error: '+(r.error||'desconocido')); }
    });
  });
}

['fd-lb','fd-fecha','fd-tar','fd-sku'].forEach(function(id){ document.getElementById(id).addEventListener('input', renderDetalle); });
document.getElementById('btn-fd-c').addEventListener('click', function() {
  ['fd-lb','fd-fecha','fd-tar','fd-sku'].forEach(function(id){document.getElementById(id).value='';});
  DB.filtroTarima=null; renderDetalle();
});
document.getElementById('btn-det-qf').addEventListener('click', function() {
  DB.filtroTarima=null; document.getElementById('fd-tar').value=''; renderDetalle();
});
document.getElementById('btn-ref-det').addEventListener('click', renderDetalle);

// =============================================================
// TAB 3 - CARGA TEÓRICO
// =============================================================
document.getElementById('inp-teo').addEventListener('change', async function(e) {
  var file = e.target.files[0]; if (!file) return;
  document.getElementById('teo-prog').classList.remove('h');
  document.getElementById('teo-msg').innerHTML='';
  var fd = new FormData(); fd.append('archivo', file);
  var r = await apiForm('/api/teorico/subir', fd);
  document.getElementById('teo-prog').classList.add('h');
  if (r.requiere_confirmacion) {
    var ok = await confirm2('Reemplazar teórico', r.mensaje, 'Reemplazar', 'bw');
    if (!ok) { e.target.value=''; return; }
    var fd2 = new FormData(); fd2.append('archivo', file); fd2.append('forzar','true');
    document.getElementById('teo-prog').classList.remove('h');
    var r2 = await apiForm('/api/teorico/subir', fd2);
    document.getElementById('teo-prog').classList.add('h');
    if (r2.ok) { DB.teorico=r2.data||[]; flash('teo-msg','al-s',r2.mensaje); mostrarTeorico(); }
    else flash('teo-msg','al-e',r2.error||'Error');
  } else if (r.ok) {
    DB.teorico=r.data||[]; flash('teo-msg','al-s',r.mensaje); mostrarTeorico();
  } else {
    flash('teo-msg','al-e','Error: '+(r.error||'desconocido'),5000);
  }
  e.target.value='';
});

function mostrarTeorico() {
  var wrap = document.getElementById('teo-tabla');
  if (!DB.teorico.length) { wrap.classList.add('h'); return; }
  wrap.classList.remove('h');
  document.getElementById('teo-cnt').textContent=DB.teorico.length+' registros';
  var max = Math.min(DB.teorico.length,300);
  var h='';
  for (var i=0; i<max; i++) {
    var r=DB.teorico[i];
    h+='<tr><td class="mono"><b>'+(r.sku||'-')+'</b></td><td>'+(r.nombre||'-')+'</td><td>'+(r.cant952||r.cantidad||0)+'</td><td>'+(r.unidad||'-')+'</td><td>'+(r.existencia||0)+'</td><td>'+(r.disponible||0)+'</td></tr>';
  }
  if (DB.teorico.length>300) h+='<tr><td colspan="6" class="te muted">...y '+(DB.teorico.length-300)+' más</td></tr>';
  document.getElementById('tb-teo').innerHTML=h;
}

// =============================================================
// TAB 4 - CONTROL DE MANIFIESTOS
// =============================================================
function renderControl() {
  var tb = document.getElementById('tb-ctrl');
  var visible = DB.pts.filter(function(p){return p.estado!=='borrado';});
  if (!visible.length) { tb.innerHTML='<tr><td colspan="13" class="te">Sin papeles de trabajo. Presiona + Generar PT.</td></tr>'; return; }
  var h='';
  visible.forEach(function(pt) {
    var estD = pt.estado==='activo'?'en_proceso':pt.estado;
    var colabs = (pt.colaboradores||[]).join(', ')||'-';
    var readonly = !pt.editando ? ' readonly' : '';
    var bEdit = !pt.editando
      ? '<button class="btn bg2 xs" data-id="'+pt.id+'" data-a="edit-start">Editar</button>'
      : '<button class="btn bs xs" data-id="'+pt.id+'" data-a="edit-save">Guardar cambios</button>';
    var bAcc = pt.estado!=='finalizado'
      ? '<button class="btn bp xs" data-id="'+pt.id+'" data-a="ir">'+(pt.auditor_lider?'Continuar':'Empezar')+'</button>'
      : '<button class="btn bg2 xs" data-id="'+pt.id+'" data-a="reabrir">Reabrir</button>';
    h += '<tr data-ptid="'+pt.id+'">';
    h += '<td><b class="mono">'+pt.correlativo+'</b></td>';
    h += '<td>'+badge(estD)+'</td>';
    h += '<td><input type="text" data-f="furgon" value="'+(pt.furgon||'')+'"'+readonly+' placeholder="Num." style="min-width:70px;"></td>';
    h += '<td><input type="text" data-f="placa" value="'+(pt.placa||'')+'"'+readonly+' placeholder="ABC-123" style="min-width:80px;"></td>';
    h += '<td><input type="text" data-f="marchamo" value="'+(pt.marchamo||'')+'"'+readonly+' placeholder="Num." style="min-width:80px;"></td>';
    h += '<td><input type="text" data-f="lic_hija" value="'+(pt.lic_hija||'')+'"'+readonly+' placeholder="U25-####" style="min-width:90px;"></td>';
    h += '<td><input type="text" data-f="tr999" value="'+(pt.tr999||'')+'"'+readonly+' placeholder="TR999.001.01" style="min-width:110px;"></td>';
    h += '<td><input type="text" data-f="observaciones" value="'+(pt.observaciones||'')+'"'+readonly+' placeholder="Texto" style="min-width:100px;"></td>';
    h += '<td><input type="text" data-f="carga" value="'+(pt.carga||'')+'"'+readonly+' placeholder="Num." style="min-width:70px;"></td>';
    h += '<td>'+(pt.creador||'-')+'</td>';
    h += '<td><input type="text" data-f="auditor_lider" value="'+(pt.auditor_lider||'')+'"'+readonly+' placeholder="Nombre" style="min-width:90px;"></td>';
    h += '<td>'+colabs+'</td>';
    h += '<td><div class="brow">'+bEdit+' '+bAcc
      +' <button class="btn bg2 xs" data-id="'+pt.id+'" data-a="wms">Subir Lic. Hija WMS</button>'
      +' <button class="btn bp xs" data-id="'+pt.id+'" data-a="manif">Generar Manifiesto</button>'
      +' <button class="btn bd xs" data-id="'+pt.id+'" data-a="borrar">Borrar</button>'
      +'</div></td>';
    h += '</tr>';
  });
  tb.innerHTML = h;
  document.querySelectorAll('[data-a]').forEach(function(b) {
    b.addEventListener('click', function() { handleCtrl(b.dataset.a, b.dataset.id); });
  });
}

async function handleCtrl(act, id) {
  var pt = DB.pts.find(function(p){return p.id==id;});
  if (!pt) return;

  if (act==='borrar') {
    var ok = await confirm2('Borrar PT','Eliminar '+pt.correlativo+'? Esta acción no se puede deshacer.');
    if (!ok) return;
    var r = await api('/api/pt/'+id, {method:'DELETE'});
    if (r.ok) { pt.estado='borrado'; if(DB.ptActivo==pt.id) DB.ptActivo=null; renderControl(); }
    else alert('Error: '+(r.error||'desconocido'));
    return;
  }
  if (act==='edit-start') { pt.editando=true; renderControl(); return; }
  if (act==='edit-save') {
    var row = document.querySelector('tr[data-ptid="'+pt.id+'"]');
    var updates = {};
    if (row) {
      ['furgon','placa','marchamo','lic_hija','tr999','observaciones','carga','auditor_lider'].forEach(function(f) {
        var inp = row.querySelector('[data-f="'+f+'"]');
        if (inp) updates[f] = pt[f] = inp.value.trim();
      });
    }
    var r = await api('/api/pt/'+id, {method:'PUT', body:updates});
    if (r.ok) { pt.editando=false; renderControl(); actualizarBannerPP(); }
    else alert('Error: '+(r.error||'desconocido'));
    return;
  }
  if (act==='reabrir') {
    var r = await api('/api/pt/'+id, {method:'PUT', body:{estado:'activo'}});
    if (r.ok) { pt.estado='activo'; renderControl(); }
    return;
  }
  if (act==='wms') {
    document.getElementById('mwms-id').value=pt.id;
    document.getElementById('wms-msg').innerHTML='';
    document.getElementById('mod-wms').classList.remove('h');
    return;
  }
  if (act==='manif') { DB.ptActivo=pt.id; abrirModalManifiesto(pt, false); return; }
  if (act==='ir') {
    var r2 = await api('/api/pt/'+id, {method:'PUT', body:{estado:'activo', auditor_lider:pt.auditor_lider||USUARIO}});
    if (r2.ok) {
      pt.estado='activo';
      if (!pt.auditor_lider) pt.auditor_lider=USUARIO;
      else if ((pt.colaboradores||[]).indexOf(USUARIO)<0) {
        await api('/api/pt/'+id+'/colaborador', {method:'POST', body:{usuario:USUARIO}});
        pt.colaboradores=pt.colaboradores||[]; pt.colaboradores.push(USUARIO);
      }
    }
    DB.ptActivo=pt.id;
    goTab('papel');
  }
}

document.getElementById('btn-gen-pt').addEventListener('click', async function() {
  var fecha = hoy();
  var cnt = DB.pts.filter(function(p){return p.fecha===fecha && p.estado!=='borrado';}).length;
  var suf = ('0'+(cnt+1)).slice(-2);
  var cor = 'PT-'+fecha+'-'+suf;
  flash('ctrl-msg','al-i','<span class="spin">⟳</span> Generando PT...',0);
  var r = await api('/api/pt', {method:'POST', body:{correlativo:cor, fecha:fecha, creador:USUARIO}});
  if (r.ok) {
    r.data.editando=false; r.data.skus=[];
    DB.pts.unshift(r.data);
    flash('ctrl-msg','al-s','PT generado: '+cor,4000);
    renderControl();
  } else { flash('ctrl-msg','al-e','Error: '+(r.error||'desconocido'),4000); }
});

document.getElementById('btn-ref-ctrl').addEventListener('click', renderControl);

document.getElementById('btn-wms-c').addEventListener('click', function(){document.getElementById('mod-wms').classList.add('h');});
document.getElementById('inp-wms').addEventListener('change', async function(e) {
  var file = e.target.files[0];
  var ptId = document.getElementById('mwms-id').value;
  if (!file) return;
  flash('wms-msg','al-i','<span class="spin">⟳</span> Subiendo...',0);
  var fd = new FormData(); fd.append('archivo', file); fd.append('pt_id', ptId);
  var r = await apiForm('/api/pt/wms', fd);
  if (r.ok) {
    // Actualizar wms_cantidad en pt_skus local
    if (r.data) r.data.forEach(function(w) {
      DB.pt_skus.forEach(function(s) { if(s.pt_id==ptId && s.sku===w.sku) s.wms_cantidad=w.cant; });
    });
    flash('wms-msg','al-s',(r.total||0)+' registros WMS cargados',3000);
    setTimeout(function(){document.getElementById('mod-wms').classList.add('h');},1500);
  } else { flash('wms-msg','al-e','Error: '+(r.error||'desconocido'),5000); }
  e.target.value='';
});

// =============================================================
// GENERAR MANIFIESTO
// =============================================================
var _manifPt=null, _manifMuestra=false;

function abrirModalManifiesto(pt, esMuestra) {
  _manifPt=pt; _manifMuestra=esMuestra;
  document.getElementById('mod-manif').classList.remove('h');
}

document.getElementById('btn-manif-c').addEventListener('click', function(){document.getElementById('mod-manif').classList.add('h');});

function calcManifData(pt, esMuestra) {
  var skus = DB.pt_skus.filter(function(s){return s.pt_id===pt.id;});
  var porSku = {};
  skus.forEach(function(s) {
    if (!porSku[s.sku]) porSku[s.sku]={total:0,auditado:0};
    var cant = parseFloat(s.fisico||0);
    porSku[s.sku].total+=cant;
    if (s.estado==='auditado'||s.estado==='cuadrado') porSku[s.sku].auditado+=cant;
  });
  return skus.map(function(s) {
    var pct = porSku[s.sku].total>0 ? Math.round(porSku[s.sku].auditado/porSku[s.sku].total*100) : 0;
    var wmsVal = s.wms_cantidad!==null&&s.wms_cantidad!==undefined ? s.wms_cantidad : '-';
    var cantidad = esMuestra ? (wmsVal!=='-'?wmsVal:s.fisico||0) : (s.fisico||0);
    var validado = esMuestra ? (s.fisico||0) : wmsVal;
    var difVal = (wmsVal!=='-'?parseFloat(wmsVal)||0:0)-(parseFloat(s.fisico||0));
    return {sku:s.sku, estatus:s.estado==='auditado'?'Auditado':'No Auditado',
      descripcion:s.descripcion||'-', pct:pct+'%', cantidad:cantidad, validado_wms:validado, diferencia:difVal};
  });
}

document.getElementById('btn-manif-xlsx').addEventListener('click', function(){
  generarManifiestoCSV(_manifPt,_manifMuestra);
  document.getElementById('mod-manif').classList.add('h');
});
document.getElementById('btn-manif-word').addEventListener('click', function(){
  generarManifiestoTXT(_manifPt,_manifMuestra);
  document.getElementById('mod-manif').classList.add('h');
});
document.getElementById('btn-manif-pdf').addEventListener('click', function(){
  generarManifiestoPDF(_manifPt,_manifMuestra);
  document.getElementById('mod-manif').classList.add('h');
});

function generarManifiestoCSV(pt, esMuestra) {
  var rows=calcManifData(pt,esMuestra);
  var colWMS=esMuestra?'VALIDADO':'WMS';
  var lines=[['CODIGO','ESTATUS','DESCRIPCION','% AUDITADO','CANTIDAD',colWMS,'DIFERENCIA'].join(',')];
  rows.forEach(function(r){ lines.push(['"'+r.sku+'"','"'+r.estatus+'"','"'+r.descripcion+'"','"'+r.pct+'"',r.cantidad,r.validado_wms,r.diferencia].join(',')); });
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\uFEFF'+lines.join('\n')],{type:'text/csv;charset=utf-8;'}));
  a.download='manifiesto-'+pt.correlativo+(esMuestra?'-muestra':'')+'.csv'; a.click();
}

function generarManifiestoTXT(pt, esMuestra) {
  var rows=calcManifData(pt,esMuestra);
  var fecha=new Date().toLocaleDateString('es');
  var colWMS=esMuestra?'VALIDADO':'WMS';
  var sep='========================================';
  var lineas=[sep,'        CARGA ENVÍO A BODEGA',sep,'','Marchamo: '+(pt.marchamo||'-'),'Licencia: '+(pt.lic_hija||'-'),'DIRECCIÓN: 27 Calle Bodega C 41-55 Zona 5 Calzada la Paz','UBICACIÓN: '+(pt.tr999||'-'),'DIRECCIÓN DESTINO: BODEGA NODUS (Hamilton)','Fecha: '+fecha,'Carga No.: '+(pt.carga||'-'),'',sep,['CODIGO','ESTATUS','DESCRIPCION','CANTIDAD',colWMS,'DIFERENCIA'].join('\t'),sep];
  rows.forEach(function(r){ lineas.push([r.sku,r.estatus,r.descripcion,r.cantidad,r.validado_wms,r.diferencia].join('\t')); });
  lineas.push('',sep,'AUTORIZACIÓN DE ENVÍO:','ASTRID DUARTE','CINTYA RIVERA','HUVALDO PEREZ','','ENCARGADO DE PEDIDO: HUVALDO PEREZ',sep);
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([lineas.join('\n')],{type:'text/plain;charset=utf-8'}));
  a.download='manifiesto-'+pt.correlativo+(esMuestra?'-muestra':'')+'.txt'; a.click();
}

function generarManifiestoPDF(pt, esMuestra) {
  var rows=calcManifData(pt,esMuestra);
  var fecha=new Date().toLocaleDateString('es');
  var colWMS=esMuestra?'VALIDADO':'WMS';
  var tRows=rows.map(function(r,i){
    return '<tr><td>'+(i+1)+'</td><td>'+r.sku+'</td><td>'+r.estatus+'</td><td>'+r.descripcion+'</td><td>'+r.pct+'</td><td>'+r.cantidad+'</td><td>'+r.validado_wms+'</td><td>'+r.diferencia+'</td></tr>';
  }).join('');
  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Manifiesto '+pt.correlativo+'</title><style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px}h2{text-align:center;font-size:14px}.meta{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:12px 0;font-size:11px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f0f0f0;font-weight:bold}.footer{margin-top:20px;font-size:11px;display:grid;grid-template-columns:1fr 1fr;gap:20px}@media print{button{display:none}}</style></head><body>';
  html+='<h2>CARGA ENVÍO A BODEGA</h2><div class="meta">';
  html+='<div><b>Marchamo:</b> '+(pt.marchamo||'-')+'</div><div><b>Licencia:</b> '+(pt.lic_hija||'-')+'</div>';
  html+='<div><b>Dirección:</b> 27 Calle Bodega C 41-55 Zona 5 Calzada la Paz</div><div><b>Ubicación:</b> '+(pt.tr999||'-')+'</div>';
  html+='<div><b>Destino:</b> BODEGA NODUS (Hamilton)</div><div><b>Fecha:</b> '+fecha+'</div>';
  html+='<div><b>Carga No.:</b> '+(pt.carga||'-')+'</div></div>';
  html+='<table><thead><tr><th>#</th><th>Código</th><th>Estatus</th><th>Descripción</th><th>% Aud.</th><th>Cantidad</th><th>'+colWMS+'</th><th>Diferencia</th></tr></thead><tbody>'+tRows+'</tbody></table>';
  html+='<div class="footer"><div><b>AUTORIZACIÓN DE ENVÍO:</b><br>ASTRID DUARTE<br>CINTYA RIVERA<br>HUVALDO PEREZ</div><div><b>NOMBRE Y FIRMA QUIEN RECIBE:</b><br><br><hr style="margin-top:40px;"><b>ENCARGADO DE PEDIDO:</b><br>HUVALDO PEREZ</div></div>';
  html+='</body></html>';
  var w=window.open('','_blank'); w.document.write(html); w.document.close(); w.print();
}

// =============================================================
// TAB 5 - PAPEL DE TRABAJO
// =============================================================
function actualizarBannerPP() {
  var noPt=document.getElementById('pp-no-pt');
  var conPt=document.getElementById('pp-con-pt');
  var ppBody=document.getElementById('pp-body');
  var pt=getPT();
  if (!pt) { noPt.classList.remove('h'); conPt.classList.add('h'); ppBody.classList.add('h'); return; }
  noPt.classList.add('h'); conPt.classList.remove('h'); ppBody.classList.remove('h');
  document.getElementById('pp-pt-lbl').textContent=pt.correlativo;
  var meta=[];
  if(pt.furgon) meta.push('Furgón: '+pt.furgon);
  if(pt.lic_hija) meta.push('Lic. Hija: '+pt.lic_hija);
  if(pt.tr999) meta.push('TR999: '+pt.tr999);
  meta.push('Estado: '+pt.estado);
  document.getElementById('pp-pt-meta').textContent=meta.join('  |  ');
  var campos=[['Furgón',pt.furgon],['Placa',pt.placa],['Marchamo',pt.marchamo],['Lic. Hija',pt.lic_hija],['TR999',pt.tr999],['Carga No.',pt.carga],['Observaciones',pt.observaciones],['Auditor',pt.auditor_lider]];
  var gh='';
  campos.forEach(function(c){ gh+='<div class="fg"><label>'+c[0]+'</label><input type="text" value="'+(c[1]||'-')+'" readonly></div>'; });
  document.getElementById('pp-datos').innerHTML=gh;
}

function renderPapel() {
  actualizarBannerPP();
  var pt=getPT(); if (!pt) return;
  var skus=DB.pt_skus.filter(function(s){return s.pt_id===pt.id;});
  var tb=document.getElementById('tb-pp');
  if (!skus.length) { tb.innerHTML='<tr><td colspan="12" class="te">Agrega el primer SKU arriba</td></tr>'; return; }
  var h='';
  skus.forEach(function(s) {
    var cant952=parseFloat(s.cant_952||0);
    var fis=parseFloat(s.fisico||0);
    var dif=cant952-fis;
    var dc=dif>0?'dp':(dif<0?'dn':'dz');
    var seg='-';
    if (fis>0||s.estado==='auditado') {
      if(dif===0) seg='Cuadrado';
      else if(dif<0) seg='Solicitar traslado a 952';
      else seg='Se queda en bolsón';
    }
    var valid=s.validacion===true||s.validacion===1;
    var difPost=valid?0:dif;
    var dpc=difPost>0?'dp':(difPost<0?'dn':'dz');
    h+='<tr>';
    h+='<td><b class="mono">'+s.sku+'</b></td>';
    h+='<td>'+(s.descripcion||'-')+'</td>';
    h+='<td>'+(s.tarima||'-')+'</td>';
    h+='<td>'+badge(s.estado||'no_auditado')+'</td>';
    h+='<td>'+badge(s.origen||'creado')+'</td>';
    h+='<td>'+cant952+'</td>';
    h+='<td>'+fis+'</td>';
    h+='<td class="'+dc+'">'+(dif>0?'+':'')+dif+'</td>';
    h+='<td style="font-size:11.5px;">'+seg+'</td>';
    h+='<td style="text-align:center;"><input type="checkbox" class="chk-v" data-sid="'+s.id+'"'+(valid?' checked':'')+'></td>';
    h+='<td class="'+dpc+'">'+(difPost>0?'+':'')+difPost+'</td>';
    h+='<td><div class="brow"><button class="btn bs xs btn-pp-a" data-sid="'+s.id+'">Auditar</button>';
    if (s.capturado_por===USUARIO) h+='<button class="btn bd xs btn-pp-d" data-sid="'+s.id+'">Borrar</button>';
    h+='</div></td></tr>';
  });
  tb.innerHTML=h;

  tb.querySelectorAll('.chk-v').forEach(function(chk) {
    chk.addEventListener('change', async function() {
      var sid=chk.dataset.sid;
      var r=await api('/api/pt-skus/'+sid, {method:'PUT', body:{validacion:chk.checked}});
      if (r.ok) {
        var s=DB.pt_skus.find(function(x){return x.id==sid;});
        if (s) s.validacion=chk.checked;
        renderPapel();
      }
    });
  });
  tb.querySelectorAll('.btn-pp-a').forEach(function(b) {
    b.addEventListener('click', async function() {
      var sid=b.dataset.sid;
      var r=await api('/api/pt-skus/'+sid, {method:'PUT', body:{estado:'auditado'}});
      if (r.ok) {
        var s=DB.pt_skus.find(function(x){return x.id==sid;});
        if (s) s.estado='auditado';
        renderPapel();
      }
    });
  });
  tb.querySelectorAll('.btn-pp-d').forEach(function(b) {
    b.addEventListener('click', async function() {
      var sid=b.dataset.sid;
      var ok=await confirm2('Borrar SKU','Eliminar este SKU del papel de trabajo?');
      if (!ok) return;
      var r=await api('/api/pt-skus/'+sid, {method:'DELETE', body:{usuario:USUARIO}});
      if (r.ok) {
        DB.pt_skus=DB.pt_skus.filter(function(s){return s.id!=sid;});
        renderPapel();
      } else { alert('Error: '+(r.error||'desconocido')); }
    });
  });
}

document.getElementById('pp-barra').addEventListener('input', function(e) {
  var found=buscarCat(e.target.value);
  if (found) { document.getElementById('pp-sku').value=found.sku||''; document.getElementById('pp-desc').value=found.descripcion||''; }
});
document.getElementById('pp-sku').addEventListener('blur', function(e) {
  var cat=buscarCat(e.target.value);
  if (cat) document.getElementById('pp-desc').value=cat.descripcion||'';
  var teo=buscarTeo(e.target.value);
  if (teo&&!cat) document.getElementById('pp-desc').value=teo.nombre||'';
});
document.getElementById('pp-sku').addEventListener('keydown', function(e){ if(e.key==='Enter') document.getElementById('pp-fisico').focus(); });

document.getElementById('btn-pp-add').addEventListener('click', async function() {
  var sku=document.getElementById('pp-sku').value.trim().toUpperCase();
  var msgEl=document.getElementById('pp-msg');
  if (!sku) { flash(msgEl,'al-w','Ingresa el SKU',2000); return; }
  var pt=getPT(); if (!pt) { flash(msgEl,'al-w','No hay PT seleccionado',2000); return; }
  var teo=buscarTeo(sku);
  var fis=parseFloat(document.getElementById('pp-fisico').value)||0;
  flash(msgEl,'al-i','<span class="spin">⟳</span> Guardando...',0);
  var r=await api('/api/pt/'+pt.id+'/skus', {method:'POST', body:{
    sku, descripcion:document.getElementById('pp-desc').value||(teo?teo.nombre||'':''),
    fisico:fis, tarima:document.getElementById('pp-tarima').value.trim(),
    estado:document.getElementById('pp-est').value,
    cant_952: teo ? parseFloat(teo.cant952||0) : 0,
    origen:'creado', capturado_por:USUARIO
  }});
  if (r.ok) {
    DB.pt_skus.push(r.data);
    ['pp-barra','pp-sku','pp-desc','pp-fisico','pp-tarima'].forEach(function(id){document.getElementById(id).value='';});
    document.getElementById('pp-est').value='auditado';
    flash(msgEl,'al-s','SKU '+sku+' agregado',2000);
    renderPapel();
  } else { flash(msgEl,'al-e','Error: '+(r.error||'desconocido'),4000); }
});

async function finalizarPapel(esMuestra) {
  var pt=getPT(); if (!pt) return;
  var label=esMuestra?'Finalizar como Muestra':'Finalizar como Manifiesto';
  var ok=await confirm2(label,'Marcar '+pt.correlativo+' como finalizado y generar el manifiesto?','Finalizar','bs');
  if (!ok) return;
  var r=await api('/api/pt/'+pt.id, {method:'PUT', body:{estado:'finalizado'}});
  if (r.ok) {
    pt.estado='finalizado';
    flash('pp-msg','al-s','PT finalizado. Generando manifiesto...');
    renderPapel(); renderControl();
    abrirModalManifiesto(pt, esMuestra);
  } else { alert('Error: '+(r.error||'desconocido')); }
}

document.getElementById('btn-pp-fin-m').addEventListener('click', function(){finalizarPapel(false);});
document.getElementById('btn-pp-fin-s').addEventListener('click', function(){finalizarPapel(true);});
document.getElementById('btn-pp-ir-ctrl').addEventListener('click', function(){goTab('control');});
document.getElementById('btn-pp-cambiar').addEventListener('click', function(){DB.ptActivo=null; goTab('control');});

// =============================================================
// INICIO: sincronizar datos del servidor
// =============================================================
syncInicial().then(function() {
  // Mostrar teórico si ya hay datos
  mostrarTeorico();
});
