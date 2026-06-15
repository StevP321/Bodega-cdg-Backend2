-- ============================================================
-- BODEGA CDG - SCHEMA SUPABASE
-- Ejecutar en: Supabase > SQL Editor > New query
-- ============================================================

-- 1. CATÁLOGO BARRA-SKU
CREATE TABLE IF NOT EXISTS sku_catalog (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  barcode TEXT,
  sku TEXT UNIQUE NOT NULL,
  descripcion TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. LICENCIAS BOLSÓN
CREATE TABLE IF NOT EXISTS licencias_bolson (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  licencia TEXT UNIQUE NOT NULL,
  fecha DATE NOT NULL,
  creado_por TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. CAPTURAS DE TARIMA
CREATE TABLE IF NOT EXISTS capturas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  licencia_bolson_id UUID NOT NULL REFERENCES licencias_bolson(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  descripcion TEXT,
  cantidad NUMERIC(10,2) DEFAULT 0,
  tarima TEXT NOT NULL,
  capturado_por TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. AUDITORÍAS (detalle por SKU)
CREATE TABLE IF NOT EXISTS auditorias (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  captura_id UUID UNIQUE NOT NULL REFERENCES capturas(id) ON DELETE CASCADE,
  licencia_bolson_id UUID REFERENCES licencias_bolson(id) ON DELETE SET NULL,
  sku TEXT NOT NULL,
  descripcion TEXT,
  tarima TEXT,
  cant_captura NUMERIC(10,2) DEFAULT 0,
  fisico NUMERIC(10,2) DEFAULT 0,
  diferencia NUMERIC(10,2) GENERATED ALWAYS AS (cant_captura - fisico) STORED,
  estado TEXT NOT NULL DEFAULT 'pendiente',
  auditado_por TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. TEÓRICO 952
CREATE TABLE IF NOT EXISTS teorico_952 (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sku TEXT NOT NULL,
  nombre TEXT,
  cant952 NUMERIC(10,2) DEFAULT 0,
  unidad TEXT DEFAULT 'U',
  existencia NUMERIC(10,2) DEFAULT 0,
  disponible NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. PAPELES DE TRABAJO
CREATE TABLE IF NOT EXISTS papeles_trabajo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  correlativo TEXT UNIQUE NOT NULL,
  fecha DATE NOT NULL,
  estado TEXT NOT NULL DEFAULT 'borrador',
  creador TEXT NOT NULL,
  auditor_lider TEXT,
  colaboradores TEXT[] DEFAULT '{}',
  furgon TEXT,
  placa TEXT,
  marchamo TEXT,
  lic_hija TEXT,
  tr999 TEXT,
  observaciones TEXT,
  carga TEXT,
  tipo_cierre TEXT,
  wms_data JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. SKUs DE PAPEL DE TRABAJO
CREATE TABLE IF NOT EXISTS pt_skus (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pt_id UUID NOT NULL REFERENCES papeles_trabajo(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  descripcion TEXT,
  fisico NUMERIC(10,2) DEFAULT 0,
  tarima TEXT,
  estado TEXT DEFAULT 'no_auditado',
  cant_952 NUMERIC(10,2) DEFAULT 0,
  origen TEXT DEFAULT 'creado',
  capturado_por TEXT,
  validacion BOOLEAN DEFAULT FALSE,
  wms_cantidad NUMERIC(10,2),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ÍNDICES para performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_capturas_lb_id ON capturas(licencia_bolson_id);
CREATE INDEX IF NOT EXISTS idx_capturas_sku ON capturas(sku);
CREATE INDEX IF NOT EXISTS idx_capturas_tarima ON capturas(tarima);
CREATE INDEX IF NOT EXISTS idx_auditorias_captura_id ON auditorias(captura_id);
CREATE INDEX IF NOT EXISTS idx_auditorias_sku ON auditorias(sku);
CREATE INDEX IF NOT EXISTS idx_pt_skus_pt_id ON pt_skus(pt_id);
CREATE INDEX IF NOT EXISTS idx_pt_skus_sku ON pt_skus(sku);
CREATE INDEX IF NOT EXISTS idx_sku_catalog_sku ON sku_catalog(sku);
CREATE INDEX IF NOT EXISTS idx_sku_catalog_barcode ON sku_catalog(barcode);
CREATE INDEX IF NOT EXISTS idx_teorico_sku ON teorico_952(sku);

-- ============================================================
-- TRIGGER: actualizar updated_at automáticamente
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_auditorias
  BEFORE UPDATE ON auditorias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER set_updated_at_papeles
  BEFORE UPDATE ON papeles_trabajo
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS (Row Level Security) - desactivado por simplicidad
-- El backend usa service_role key que bypasea RLS
-- ============================================================
ALTER TABLE sku_catalog DISABLE ROW LEVEL SECURITY;
ALTER TABLE licencias_bolson DISABLE ROW LEVEL SECURITY;
ALTER TABLE capturas DISABLE ROW LEVEL SECURITY;
ALTER TABLE auditorias DISABLE ROW LEVEL SECURITY;
ALTER TABLE teorico_952 DISABLE ROW LEVEL SECURITY;
ALTER TABLE papeles_trabajo DISABLE ROW LEVEL SECURITY;
ALTER TABLE pt_skus DISABLE ROW LEVEL SECURITY;
