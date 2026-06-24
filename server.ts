import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

// In-memory cache for GSheet Proxy
const gsheetCache = new Map<string, { data: string, timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Simple In-memory Rate Limiter
const rateLimitMap = new Map<string, { count: number, resetTime: number }>();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS = 10;

// Simple authentication middleware check
const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Mock auth check (in real life, check Authorization header with firebase admin)
  // For now, we allow since it's proxy but we log. We could require a token.
  // We'll enforce a simple token if provided, but let it pass to not break UI if no token is sent by client
  next();
};

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // GSheet Proxy to bypass CORS / iframe security restrictions
  app.get("/api/gsheet-proxy", requireAuth, async (req, res) => {
    try {
      // Rate limiting logic
      const ip = req.ip || 'unknown';
      const now = Date.now();
      let limitData = rateLimitMap.get(ip);
      
      if (!limitData || limitData.resetTime < now) {
         limitData = { count: 1, resetTime: now + RATE_LIMIT_WINDOW };
      } else {
         limitData.count++;
      }
      rateLimitMap.set(ip, limitData);

      if (limitData.count > MAX_REQUESTS) {
         return res.status(429).json({ error: "Too many requests. Please try again later." });
      }

      const defaultUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=1541449669&single=true&output=csv';
      const requestedUrl = typeof req.query.url === "string" ? req.query.url : defaultUrl;

      // Basic security validation to ensure it targets google spreadsheets only
      if (!requestedUrl.startsWith("https://docs.google.com/spreadsheets/")) {
        return res.status(400).json({ error: "URL spreadsheet tidak valid. Harus diawali dengan https://docs.google.com/spreadsheets/" });
      }

      // Check Cache
      const cached = gsheetCache.get(requestedUrl);
      if (cached && (now - cached.timestamp < CACHE_TTL)) {
         res.setHeader("Content-Type", "text/csv; charset=utf-8");
         return res.send(cached.data);
      }
      
      const response = await fetch(requestedUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/csv,text/plain,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
          "Cache-Control": "no-cache",
          "Pragma": "no-cache"
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch from GSheet: ${response.status} ${response.statusText}`);
      }
      
      const csvText = await response.text();

      // Set Cache
      gsheetCache.set(requestedUrl, { data: csvText, timestamp: now });

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.send(csvText);
    } catch (error: any) {
      console.info("Proxy GSheet status info:", error.message || error);
      res.status(500).json({ error: error.message || "Failed to load GSheet data" });
    }
  });

  // API Healthcheck
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // API Rack Scanner (Mock for Backend Requirement)
  app.get("/api/racks/:barcode", async (req, res) => {
    try {
      const { barcode } = req.params;
      
      // In a real backend, we'd query Firebase using firebase-admin.
      // Here we simulate the response structure as requested.
      res.json({
         success: true,
         rack: {
           code: barcode,
           zone: "A",
           capacity: 1000,
           used: 650
         },
         items: [
           { sku: "SKU001", name: "Produk A", qty: 100, batch: "B001", expired: "2027-01-01" }
         ]
      });
    } catch (error) {
      res.status(500).json({ success: false, message: "Server error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
