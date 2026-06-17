import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // GSheet Proxy to bypass CORS / iframe security restrictions
  app.get("/api/gsheet-proxy", async (req, res) => {
    try {
      const defaultUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSbvA_5FOxi2-nkfz8iJbptOhDfBCLM5LnTwrVLeJ4pf1hlGjSBywsTXQYYtEjuo0DY2M63wcJmc0tP/pub?gid=1541449669&single=true&output=csv';
      const requestedUrl = typeof req.query.url === "string" ? req.query.url : defaultUrl;

      // Basic security validation to ensure it targets google spreadsheets only
      if (!requestedUrl.startsWith("https://docs.google.com/spreadsheets/")) {
        return res.status(400).json({ error: "URL spreadsheet tidak valid. Harus diawali dengan https://docs.google.com/spreadsheets/" });
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
