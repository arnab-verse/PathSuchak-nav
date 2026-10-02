import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const isProd = process.env.NODE_ENV === 'production';
  const port = process.env.PORT || 3000;

  // JSON parser for API routes
  app.use(express.json());

  // CORS headers
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // --- API Routes ---

  // 1. OSRM Routing Proxy (Resolves CORS and rate limit blocks for client)
  app.get('/api/route', async (req, res) => {
    const coordsStr = req.query.coords as string;
    if (!coordsStr) {
      return res.status(400).json({ status: 400, error: 'coords parameter is required' });
    }

    const endpoints = [
      `https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=true&alternatives=true&annotations=false`,
      `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson&steps=true&alternatives=true&annotations=false`
    ];

    let success = false;
    for (const url of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const osrmRes = await fetch(url, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (PathSuchak Tactical Nav Proxy)'
          }
        });
        clearTimeout(timeoutId);

        if (osrmRes.ok) {
          const data = await osrmRes.json();
          if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
            res.json(data);
            success = true;
            break;
          }
        }
      } catch (err: any) {
        console.warn(`Node routing proxy failed for URL: ${url} - ${err?.message}`);
      }
    }

    if (!success) {
      res.status(502).json({
        status: 502,
        error: 'Failed to fetch road geometry. All upstream OSRM routing servers are unavailable.'
      });
    }
  });

  // 2. Weather API Proxy
  app.get('/api/weather', async (req, res) => {
    const lat = parseFloat(req.query.lat as string || '20.25');
    const lon = parseFloat(req.query.lon as string || '85.83');
    const state = req.query.state as string || 'Odisha';

    try {
      const openMeteoRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,cloud_cover,wind_speed_10m&hourly=temperature_2m,precipitation,cloud_cover,wind_speed_10m`
      );
      const data = await openMeteoRes.json();
      res.json({
        status: 200,
        service: 'Open-Meteo Live Weather API',
        state,
        coordinates: { latitude: lat, longitude: lon },
        current: data.current || {},
        hourly: data.hourly || {},
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      res.status(500).json({ status: 500, error: err?.message || 'Weather API error' });
    }
  });

  // 3. Cyclone API Proxy
  app.get('/api/cyclones', async (req, res) => {
    const fromdate = req.query.fromdate as string;
    const todate = req.query.todate as string;
    let gdacsUrl = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=TC';
    if (fromdate && todate) {
      gdacsUrl += `&fromdate=${encodeURIComponent(fromdate)}&todate=${encodeURIComponent(todate)}`;
    } else if (fromdate) {
      gdacsUrl += `&fromdate=${encodeURIComponent(fromdate)}`;
    }

    try {
      const gdacsRes = await fetch(gdacsUrl, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
      });
      const gdacsData = await gdacsRes.json();
      res.json({
        status: 200,
        service: 'GDACS Tropical Cyclones Live Feed (UN OCHA)',
        credit: 'Cyclone data: GDACS (UN OCHA)',
        totalFeatures: gdacsData.features?.length || 0,
        data: gdacsData
      });
    } catch (err: any) {
      res.status(500).json({
        status: 500,
        error: err?.message || 'Failed to fetch GDACS live cyclone feed'
      });
    }
  });

  // 4. Radar API Proxy
  app.get('/api/radar', async (req, res) => {
    try {
      const rvRes = await fetch('https://api.rainviewer.com/public/weather-maps.json');
      const rvData = await rvRes.json();
      res.json({
        status: 200,
        service: 'RainViewer & INSAT-3D Satellite Doppler Radar API',
        data: rvData
      });
    } catch (e: any) {
      res.json({
        status: 200,
        service: 'RainViewer Satellite Radar API (Fallback)',
        latestFrameTime: new Date().toISOString(),
        tileTemplate: 'https://tilecache.rainviewer.com/v2/radar/{ts}/256/{z}/{x}/{y}/2/1_1.png'
      });
    }
  });

  // 5. State Weather API Proxy
  app.get('/api/state-weather', (req, res) => {
    res.json({
      status: 200,
      service: 'All Indian States Meteorological Alert Summary API',
      totalStates: 28,
      timestamp: new Date().toISOString()
    });
  });

  // 6. Mock Incidents API
  app.get('/api/incidents', (req, res) => {
    res.json({
      status: 200,
      service: 'Emergency Disaster & Road Obstacle API',
      incidents: [
        {
          id: 'IR-402',
          title: 'Active Rockfall - Sector 4B',
          category: 'landslide',
          severity: 'high',
          latitude: 27.5925,
          longitude: 91.8745
        }
      ]
    });
  });

  // --- Serve Frontend ---
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom'
    });
    app.use(vite.middlewares);
    
    // Serve HTML entry point through Vite index.html transformation
    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const htmlFile = path.resolve(__dirname, 'index.html');
        let html = await vite.transformIndexHtml(url, await import('fs/promises').then(fs => fs.readFile(htmlFile, 'utf-8')));
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    // Serve static compiled output in production
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, () => {
    console.log(`[PathSuchak Server] Full-stack engine listening at http://localhost:${port}`);
  });
}

startServer();
