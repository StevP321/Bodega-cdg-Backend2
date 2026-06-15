require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const XLSX = require('xlsx');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============================================================
// HELPERS
// ============================================================
function parseXlsx(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: '' });
}

function normalizeKey(str) {
  return (str || '').toString().trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ============================================================
// HEALTH CHECK
// ============================================================
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: new Date().toISOString() });
});

// ============================================================
// CATÁLOGO BARRA-SKU
// ============================================================
// Subir Excel al catálogo
app.post('/api/catalogo/subir', upload.single('archivo'), async (req, res) => {
  try {
    const rows = parseXlsx(req.file.buffer);
    const records = rows.map(r => {
      // Detectar columnas flexiblemente
      const keys = Object.keys(r);
      const barKey = keys.find(k => normalizeKey(k).includes('barra') || normalizeKey(k).includes('codigo') || normalizeKey(k) === 'barcode');
      const skuKey = keys.find(k => normalizeKey(k) === 'sku');
      const descKey = keys.find(k => normalizeKey(k).includes('desc') || normalizeKey(k).includes('nombre'));
      return {
        barcode: barKey ? String(r[barKey]).trim() : '',
        sku: skuKey ? String(r[skuKey]).trim() : '',
        descripcion: descKey ? String(r[descKey]).trim() : ''
      };
    }).filter(r => r.sku || r.barcode);

    // Upsert en Supabase por barcode o sku
    const { error } = await supabase
      .from('sku_catalog')
      .upsert(records, { onConflict: 'sku' });

    if (error) throw error;

    // Devolver datos actuales del catálogo
    const { data } = await supabase.from('sku_catalog').select('*').order('sku');
    res.json({ ok: true, total: records.length, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Obtener catálogo completo
app.get('/api/catalogo', async (req, res) => {
  try {
    const { data, error } = await supabase.from('sku_catalog').select('*').order('sku');
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Buscar en catálogo
app.get('/api/catalogo/buscar', async (req, res) => {
  try {
    const q = req.query.q || '';
    const { data, error } = await supabase
      .from('sku_catalog')
      .select('*')
      .or(`sku.ilike.%${q}%,barcode.ilike.%${q}%,descripcion.ilike.%${q}%`)
      .limit(50);
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ============================================================
// LICENCIAS BOLSÓN
// ============================================================
app.get('/api/licencias-bolson', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('licencias_bolson')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/api/licencias-bolson', async (req, res) => {
  try {
    const { licencia, fecha, creado_por } = req.body;
    if (!licencia) return res.json({ ok: false, error: 'Licencia requerida' });

    const { data, error } = await supabase
      .from('licencias_bolson')
      .insert({ licencia, fecha, creado_por })
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.delete('/api/licencias-bolson/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Borrar capturas asociadas primero
    await supabase.from('capturas').delete().eq('licencia_bolson_id', id);
    const { error } = await supabase.from('licencias_bolson').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ============================================================
// CAPTURAS DE TARIMA
// ============================================================
app.get('/api/capturas', async (req, res) => {
  try {
    const { licencia_bolson_id } = req.query;
    let q = supabase.from('capturas').select('*').order('created_at');
    if (licencia_bolson_id) q = q.eq('licencia_bolson_id', licencia_bolson_id);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/api/capturas', async (req, res) => {
  try {
    const { licencia_bolson_id, sku, descripcion, cantidad, tarima, capturado_por } = req.body;
    const { data, error } = await supabase
      .from('capturas')
      .insert({ licencia_bolson_id, sku, descripcion, cantidad, tarima, capturado_por })
      .select()
      .single();
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.delete('/api/capturas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { usuario } = req.body;
    // Verificar que el usuario sea el mismo que capturó
    const { data: cap } = await supabase.from('capturas').select('capturado_por').eq('id', id).single();
    if (cap && cap.capturado_por !== usuario) {
      return res.json({ ok: false, error: 'Solo el usuario que capturó puede borrar esta línea' });
    }
    const { error } = await supabase.from('capturas').delete().eq('id', id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ============================================================
// AUDITORÍAS (detalle por SKU)
// ============================================================
app.get('/api/auditorias', async (req, res) => {
  try {
    const { tarima, licencia_bolson_id, sku } = req.query;
    let q = supabase.from('auditorias').select('*').order('created_at');
    if (tarima) q = q.eq('tarima', tarima);
    if (licencia_bolson_id) q = q.eq('licencia_bolson_id', licencia_bolson_id);
    if (sku) q = q.eq('sku', sku);
    const { data, error } = await q;
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Auditar un SKU (actualizar fisico + estado)
app.post('/api/auditorias/auditar', async (req, res) => {
  try {
    const { captura_id, fisico, auditado_por, licencia_bolson_id, sku, descripcion, tarima, cant_captura } = req.body;
    const diferencia = cant_captura - fisico;
    let estado = 'cuadrado';
    if (diferencia > 0) estado = 'faltante';
    if (diferencia < 0) estado = 'sobrante';

    // Upsert en auditorias
    const { data, error } = await supabase
      .from('auditorias')
      .upsert({
        captura_id, licencia_bolson_id, sku, descripcion, tarima,
        cant_captura, fisico, diferencia, estado, auditado_por
      }, { onConflict: 'captura_id' })
      .select()
      .single();

    if (error) throw error;
    res.json({ ok: true, data, estado, diferencia });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Anular auditoría
app.delete('/api/auditorias/:captura_id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('auditorias')
      .delete()
      .eq('captura_id', req.params.captura_id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ============================================================
// TEÓRICO 952
// ============================================================
app.post('/api/teorico/subir', upload.single('archivo'), async (req, res) => {
  try {
    const forzar = req.body.forzar === 'true';

    // Verificar si ya hay teórico cargado
    const { count } = await supabase.from('teorico_952').select('id', { count: 'exact', head: true });

    if (count > 0 && !forzar) {
      return res.json({
        ok: false,
        requiere_confirmacion: true,
        mensaje: `Ya existe un teórico con ${count} registros. ¿Deseas reemplazarlo?`
      });
    }

    const rows = parseXlsx(req.file.buffer);
    const records = rows.map(r => {
      const keys = Object.keys(r);
      const skuKey = keys.find(k => normalizeKey(k) === 'sku');
      const nomKey = keys.find(k => normalizeKey(k) === 'nombre' || normalizeKey(k).includes('nombre'));
      const cantKey = keys.find(k => normalizeKey(k).includes('cant'));
      const unidKey = keys.find(k => normalizeKey(k) === 'unidad');
      const existKey = keys.find(k => normalizeKey(k).includes('exist'));
      const dispKey = keys.find(k => normalizeKey(k).includes('disp'));
      return {
        sku: skuKey ? String(r[skuKey]).trim() : '',
        nombre: nomKey ? String(r[nomKey]).trim() : '',
        cant952: cantKey ? parseFloat(r[cantKey]) || 0 : 0,
        unidad: unidKey ? String(r[unidKey]).trim() : 'U',
        existencia: existKey ? parseFloat(r[existKey]) || 0 : 0,
        disponible: dispKey ? parseFloat(r[dispKey]) || 0 : 0
      };
    }).filter(r => r.sku);

    // Reemplazar todo
    if (count > 0) await supabase.from('teorico_952').delete().neq('id', 0);
    const { error } = await supabase.from('teorico_952').insert(records);
    if (error) throw error;

    const { data } = await supabase.from('teorico_952').select('*').order('sku');
    res.json({ ok: true, mensaje: `Teórico cargado: ${records.length} registros`, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.get('/api/teorico', async (req, res) => {
  try {
    const { data, error } = await supabase.from('teorico_952').select('*').order('sku');
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ============================================================
// PAPELES DE TRABAJO (PT)
// ============================================================
app.get('/api/pt', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('papeles_trabajo')
      .select('*, pt_skus(*)')
      .neq('estado', 'borrado')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/api/pt', async (req, res) => {
  try {
    const { correlativo, fecha, creador } = req.body;
    const { data, error } = await supabase
      .from('papeles_trabajo')
      .insert({ correlativo, fecha, estado: 'borrador', creador })
      .select()
      .single();
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.put('/api/pt/:id', async (req, res) => {
  try {
    const { furgon, placa, marchamo, lic_hija, tr999, observaciones, carga, auditor_lider, estado } = req.body;
    const updates = {};
    if (furgon !== undefined) updates.furgon = furgon;
    if (placa !== undefined) updates.placa = placa;
    if (marchamo !== undefined) updates.marchamo = marchamo;
    if (lic_hija !== undefined) updates.lic_hija = lic_hija;
    if (tr999 !== undefined) updates.tr999 = tr999;
    if (observaciones !== undefined) updates.observaciones = observaciones;
    if (carga !== undefined) updates.carga = carga;
    if (auditor_lider !== undefined) updates.auditor_lider = auditor_lider;
    if (estado !== undefined) updates.estado = estado;

    const { data, error } = await supabase
      .from('papeles_trabajo')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.delete('/api/pt/:id', async (req, res) => {
  try {
    await supabase.from('pt_skus').delete().eq('pt_id', req.params.id);
    const { error } = await supabase
      .from('papeles_trabajo')
      .update({ estado: 'borrado' })
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Colaboradores de PT
app.post('/api/pt/:id/colaborador', async (req, res) => {
  try {
    const { usuario } = req.body;
    const { data: pt } = await supabase.from('papeles_trabajo').select('colaboradores').eq('id', req.params.id).single();
    const colabs = pt.colaboradores || [];
    if (!colabs.includes(usuario)) colabs.push(usuario);
    const { error } = await supabase.from('papeles_trabajo').update({ colaboradores: colabs }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ============================================================
// SKUS DE PAPEL DE TRABAJO
// ============================================================
app.get('/api/pt/:id/skus', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('pt_skus')
      .select('*')
      .eq('pt_id', req.params.id)
      .order('created_at');
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.post('/api/pt/:id/skus', async (req, res) => {
  try {
    const { sku, descripcion, fisico, tarima, estado, cant_952, origen, capturado_por } = req.body;
    const { data, error } = await supabase
      .from('pt_skus')
      .insert({ pt_id: req.params.id, sku, descripcion, fisico, tarima, estado, cant_952, origen, capturado_por, validacion: false })
      .select()
      .single();
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.put('/api/pt-skus/:id', async (req, res) => {
  try {
    const updates = {};
    ['fisico', 'estado', 'validacion', 'wms_cantidad', 'tarima'].forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });
    const { data, error } = await supabase.from('pt_skus').update(updates).eq('id', req.params.id).select().single();
    if (error) throw error;
    res.json({ ok: true, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

app.delete('/api/pt-skus/:id', async (req, res) => {
  try {
    const { usuario } = req.body;
    const { data: sku } = await supabase.from('pt_skus').select('capturado_por').eq('id', req.params.id).single();
    if (sku && sku.capturado_por !== usuario) {
      return res.json({ ok: false, error: 'Solo el usuario que capturó puede borrar esta línea' });
    }
    const { error } = await supabase.from('pt_skus').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ============================================================
// SUBIR WMS (Licencia Hija)
// ============================================================
app.post('/api/pt/wms', upload.single('archivo'), async (req, res) => {
  try {
    const pt_id = req.body.pt_id;
    const rows = parseXlsx(req.file.buffer);
    const records = rows.map(r => {
      const keys = Object.keys(r);
      const skuKey = keys.find(k => normalizeKey(k) === 'sku');
      const cantKey = keys.find(k => normalizeKey(k).includes('cant'));
      const nomKey = keys.find(k => normalizeKey(k).includes('nombre'));
      return {
        sku: skuKey ? String(r[skuKey]).trim() : '',
        cant: cantKey ? parseFloat(r[cantKey]) || 0 : 0,
        nombre: nomKey ? String(r[nomKey]).trim() : ''
      };
    }).filter(r => r.sku);

    // Actualizar wms_cantidad en pt_skus
    for (const rec of records) {
      await supabase
        .from('pt_skus')
        .update({ wms_cantidad: rec.cant })
        .eq('pt_id', pt_id)
        .eq('sku', rec.sku);
    }

    // Guardar datos WMS en papeles_trabajo
    await supabase
      .from('papeles_trabajo')
      .update({ wms_data: records })
      .eq('id', pt_id);

    res.json({ ok: true, total: records.length, data: records });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ============================================================
// SYNC INICIAL: cargar todo el estado al abrir la app
// ============================================================
app.get('/api/sync', async (req, res) => {
  try {
    const [cat, lbs, caps, auds, teo, pts, ptSkus] = await Promise.all([
      supabase.from('sku_catalog').select('*').order('sku'),
      supabase.from('licencias_bolson').select('*').order('created_at', { ascending: false }),
      supabase.from('capturas').select('*').order('created_at'),
      supabase.from('auditorias').select('*').order('created_at'),
      supabase.from('teorico_952').select('*').order('sku'),
      supabase.from('papeles_trabajo').select('*').neq('estado', 'borrado').order('created_at', { ascending: false }),
      supabase.from('pt_skus').select('*').order('created_at')
    ]);
    res.json({
      ok: true,
      catalogo: cat.data || [],
      licencias_bolson: lbs.data || [],
      capturas: caps.data || [],
      auditorias: auds.data || [],
      teorico: teo.data || [],
      pts: pts.data || [],
      pt_skus: ptSkus.data || []
    });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// Servir frontend en producción
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Bodega CDG backend en puerto ${PORT}`));
