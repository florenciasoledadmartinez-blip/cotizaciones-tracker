# Cotizaciones Tracker

Sistema interno de seguimiento operativo de cotizaciones comerciales.

---

## Credenciales de prueba (cargadas automáticamente)

| Rol           | Email                  | Contraseña   |
|---------------|------------------------|--------------|
| Administrador | admin@empresa.com      | admin123     |
| Líder         | lider@empresa.com      | lider123     |
| Operativo 1   | juan@empresa.com       | usuario123   |
| Operativo 2   | ana@empresa.com        | usuario123   |
| Operativo 3   | carlos@empresa.com     | usuario123   |

---

## 🚀 Deploy en Railway (acceso desde cualquier lugar)

### Paso 1 — Subir el código a GitHub

1. Instalá [GitHub Desktop](https://desktop.github.com/) si no lo tenés
2. Creá un repositorio nuevo en [github.com](https://github.com)
3. Subí esta carpeta como el repositorio

### Paso 2 — Crear el proyecto en Railway

1. Entrá a [railway.app](https://railway.app) y creá una cuenta (es gratis)
2. Hacé clic en **"New Project"**
3. Elegí **"Deploy from GitHub repo"** y seleccioná tu repositorio
4. Railway detecta automáticamente que es Next.js

### Paso 3 — Agregar la base de datos PostgreSQL

1. Dentro de tu proyecto en Railway, hacé clic en **"+ New"**
2. Elegí **"Database" → "PostgreSQL"**
3. Railway crea la base de datos y te da una `DATABASE_URL` automáticamente

### Paso 4 — Conectar la app con la base de datos

1. Hacé clic en el servicio de tu app (no la base de datos)
2. Entrá en **"Variables"**
3. Hacé clic en **"+ Add Variable Reference"**
4. Seleccioná la variable **`DATABASE_URL`** de la base de datos PostgreSQL
5. Agregá también estas variables manualmente:
   ```
   JWT_SECRET = una-clave-secreta-larga-y-aleatoria
   NODE_ENV   = production
   ```
6. Opcional para IA:
   ```
   ANTHROPIC_API_KEY = sk-ant-...
   ```

### Paso 5 — Hacer el deploy

1. Railway hace el build automáticamente al subir código
2. Cuando termine, hacé clic en **"Generate Domain"** para obtener tu URL pública
3. La URL va a ser algo como: `https://cotizaciones-tracker.up.railway.app`

### Paso 6 — Primera vez que entres

La base de datos se inicializa sola al primer request. Los datos de prueba (usuarios y cotizaciones) se cargan automáticamente.

---

## 💻 Correr localmente (conectado a la BD de Railway)

Una vez que tenés la BD en Railway, podés usarla también en local:

1. En Railway → tu base de datos → **"Variables"** → copiá la `DATABASE_URL`
2. Pegala en el archivo `.env.local`:
   ```
   DATABASE_URL=postgresql://...
   JWT_SECRET=cualquier-clave-local
   ```
3. Instalá Node.js desde [nodejs.org](https://nodejs.org) (versión LTS)
4. Abrí una terminal en esta carpeta y ejecutá:
   ```
   npm install
   npm run dev
   ```
5. Abrí: http://localhost:3000

---

## Funcionalidades

| Pantalla | Descripción |
|---|---|
| **Dashboard** | KPIs, gráficos, actividad reciente (solo líder/admin) |
| **Cotizaciones** | Tabla filtrable, tabs por estado, crear/editar |
| **Detalle** | Checklist de tareas, historial de cambios, análisis IA |
| **Línea de tiempo** | Gantt con barras de colores por estado y avance |
| **Administración** | Gestión de usuarios y plantillas de tareas |

## Importar desde Excel

En la pantalla de Cotizaciones → botón **"Importar"**.

Columnas reconocidas (en español o inglés):
- Número de Cotización / quote_number
- Cliente / client_name
- Descripción / description
- Tipo / quote_type
- Fecha Recepción (DD/MM/YYYY o YYYY-MM-DD)
- Deadline
- Prioridad (Baja / Media / Alta / Urgente)
- Estado
- Observaciones
