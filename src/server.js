import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import snapRouter from "./routes/snap.js";

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: "200kb" }));

// Rate limit pour éviter l'abus et réduire coûts Apify
app.use("/api/snap", rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
}));

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
