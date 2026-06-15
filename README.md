# Bodega CDG — Guía de Despliegue Completa

## Paso 1: Supabase — Crear las tablas

1. Abre tu proyecto en **https://supabase.com/dashboard/project/vtdajakggfrotsrtaio**
2. En el menú izquierdo haz clic en **SQL Editor**
3. Clic en **New query**
4. Copia y pega TODO el contenido del archivo `supabase_schema.sql`
5. Clic en **Run** (botón verde) — deberías ver "Success"

Esto crea 7 tablas:
- `sku_catalog` — catálogo de barras y SKUs
- `licencias_bolson` — las licencias del día
- `capturas` — SKUs capturados por tarima
- `auditorias` — conteos físicos del auditor
- `teorico_952` — archivo Excel del teórico
- `papeles_trabajo` — papeles de trabajo (PTs)
- `pt_skus` — SKUs dentro de cada PT

---

## Paso 2: Obtener la Service Key de Supabase

1. En tu proyecto Supabase, ve a **Settings → API** (ícono de engrane)
2. Busca la sección **Project API Keys**
3. Copia la key llamada **service_role** (⚠️ NO la anon/public)

---

## Paso 3: Render — Subir el código a GitHub

1. Crea un repositorio en **https://github.com/new** (puede ser privado)
2. Sube la carpeta `bodega-cdg-backend` con estos archivos:
   ```
   bodega-cdg-backend/
   ├── server.js
   ├── package.json
   ├── .env.example
   ├── supabase_schema.sql
   └── public/
       ├── index.html
       └── app.js
   ```
3. En la raíz crea un archivo `.gitignore` con:
   ```
   node_modules/
   .env
   ```

---

## Paso 4: Render — Crear el Web Service

1. Abre **https://dashboard.render.com**
2. Clic en **+ New → Web Service**
3. Conecta tu repositorio de GitHub
4. Configura así:
   - **Name:** `bodega-cdg`
   - **Region:** `US East (Ohio)` o la más cercana
   - **Branch:** `main`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Plan:** `Free`
5. En la sección **Environment Variables** agrega:
   ```
   SUPABASE_URL = https://vtdajakggfrotsrtaio.supabase.co
   SUPABASE_SERVICE_KEY = (la key service_role que copiaste)
   ```
6. Clic en **Create Web Service**

Render tardará 2-3 minutos en hacer el deploy.

---

## Paso 5: Verificar que funciona

1. Una vez deployado, Render te dará una URL tipo:
   `https://bodega-cdg.onrender.com`
2. Abre esa URL en el navegador — deberías ver la app
3. Verifica el health check en:
   `https://bodega-cdg.onrender.com/api/health`
   Deberías ver: `{"ok":true,"ts":"..."}`

---

## Notas importantes

### Plan Free de Render
- El servicio se "duerme" tras 15 minutos de inactividad
- La primera carga después de inactivo tarda ~30 segundos
- Para evitar esto, actualiza a plan Starter ($7/mes) o agrega un cron job que haga ping cada 10 minutos

### Usuarios y roles
- Por ahora el usuario está hardcodeado como `auditor1`
- Para producción real, implementar autenticación con Supabase Auth

### Seguridad
- La `service_role` key NUNCA debe ir en el frontend
- Solo va en las variables de entorno de Render (servidor)
- La app frontend usa el backend como proxy

---

## Flujo de uso

```
1. Catálogo → Cargar Excel con barras/SKUs
2. Captura de Tarima → Crear licencia bolsón → capturar SKUs
3. Auditar Sesión:
   Tab 1 Tarimas → ver resumen por tarima
   Tab 2 Detalle → auditar físico por SKU
   Tab 3 Carga Teórico → subir Excel 952.006.001
   Tab 4 Control de Manifiestos → crear PT, subir licencia hija WMS
   Tab 5 Papel de Trabajo → agregar SKUs, finalizar, generar manifiesto
```
