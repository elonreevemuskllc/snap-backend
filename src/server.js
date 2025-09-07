import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import snapRouter from "./routes/snap.js";

const app = express();

app.use(cors({ origin: "*", methods: ["GET","POST"] }));
app.use(express.json({ limit: "1mb" }));

// Rate limit pour éviter l'abus et réduire coûts Apify
app.use("/api/snap", rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
}));

// 🔍 santé
app.get("/health", (req, res) => {
  res.json({ ok: true, ts: Date.now(), env: process.env.NODE_ENV || "dev" });
});

// ⚠️ Route temporaire pour valider le pipeline
app.post("/api/snap/lookup", async (req, res) => {
  const u = String(req.body?.username || "").trim();
  if (!/^[a-zA-Z0-9._-]{1,32}$/.test(u)) return res.status(400).json({ error: "invalid_username" });

  try {
    // temporaire pour valider le pipeline:
    res.json({
      ok: true,
      cached: false,
      data: { username: u, displayName: "TEMP OK (Railway)", fetchedAt: new Date().toISOString() }
    });
  } catch (e) {
    console.error("lookup error:", e?.name, e?.message);
    res.status(502).json({ error: "upstream_error" });
  }
});

app.use("/api/snap", snapRouter);

// Health check endpoint pour Railway
app.get("/", (req, res) => {
  res.json({ 
    status: "OK", 
    message: "Snap API is running",
    version: "1.0.0",
    timestamp: new Date().toISOString()
  });
});

// 404 générique
app.use((_req, res) => res.status(404).json({ error: "Not found" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API listening on :${PORT}`);
});
