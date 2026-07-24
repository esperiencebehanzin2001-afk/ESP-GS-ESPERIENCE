require("dotenv").config();
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth");
const motherRoutes = require("./routes/mother");
const activityRoutes = require("./routes/activity");
const reportsRoutes = require("./routes/reports");
const recoveryRoutes = require("./routes/recovery");
const setupRoutes = require("./routes/setup");

const app = express();

// IMPORTANT : ce serveur doit être placé derrière HTTPS (via votre
// hébergeur, ou un reverse-proxy comme Caddy/nginx qui gère le certificat
// TLS automatiquement). Sans HTTPS, les mots de passe et jetons circulent
// en clair sur le réseau — voir README.md.
app.use(helmet());
app.use(express.json({ limit: "1mb" }));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    // Si ALLOWED_ORIGINS n'est pas renseigné (cas par défaut, notamment
    // quand console-mere.html est ouvert comme simple fichier local), on
    // autorise l'origine appelante plutôt que de tout bloquer — sinon la
    // console mère ne fonctionnerait jamais "out of the box". La vraie
    // protection contre les accès non autorisés reste l'authentification
    // par mot de passe + jeton, pas cette restriction CORS. Renseignez
    // ALLOWED_ORIGINS pour durcir cela si vous hébergez la console en ligne.
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: false,
  })
);

// Limite globale, en plus des limites spécifiques sur /auth/login et /recovery/request.
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get("/health", (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Page de suivi d'activité à distance, destinée au DG de chaque entreprise
// (pas à vous : votre outil à vous est console-mere.html). Servie en statique
// pour qu'un simple lien (ex: https://votre-serveur.com/suivi.html) suffise.
app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/auth", authRoutes);
app.use("/mother", motherRoutes);
app.use("/activity", activityRoutes);
app.use("/reports", reportsRoutes);
app.use("/recovery", recoveryRoutes);
app.use("/setup", setupRoutes);

// Gestionnaire d'erreurs générique : ne renvoie jamais la stack technique
// au client (éviter de fuiter des détails internes exploitables).
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Erreur interne du serveur." });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`ESP-GS serveur central démarré sur le port ${PORT}`);
});
