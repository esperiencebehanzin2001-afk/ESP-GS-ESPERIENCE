const express = require("express");
const db = require("../db");
const { requireAuth, requireOwnBusinessOrMother } = require("../middleware/auth");

const router = express.Router();

// La boutique pousse un lot d'événements d'activité (ventes, mouvements de
// stock, etc.). Chaque appel authentifié met aussi à jour "last_seen_at",
// ce qui alimente le statut "en ligne / vu récemment" côté console mère.
router.post("/", requireAuth, (req, res) => {
  if (req.user.role === "mere") {
    return res.status(400).json({ error: "Ce compte n'est rattaché à aucune entreprise." });
  }
  const events = Array.isArray(req.body?.events) ? req.body.events : [req.body];

  const insert = db.prepare(
    `INSERT INTO activity_logs (business_id, user_id, type, amount, payload) VALUES (?,?,?,?,?)`
  );
  const tx = db.transaction((evts) => {
    for (const e of evts) {
      if (!e || !e.type) continue;
      insert.run(
        req.user.businessId,
        req.user.id,
        String(e.type).slice(0, 40),
        typeof e.amount === "number" ? e.amount : null,
        e.payload ? JSON.stringify(e.payload).slice(0, 4000) : null
      );
    }
  });
  tx(events);

  db.prepare(`UPDATE businesses SET last_seen_at = datetime('now') WHERE id = ?`).run(req.user.businessId);
  res.json({ ok: true, received: events.length });
});

// Simple ping de présence (ex: à l'ouverture de l'app, ou périodiquement).
router.post("/heartbeat", requireAuth, (req, res) => {
  if (req.user.businessId) {
    db.prepare(`UPDATE businesses SET last_seen_at = datetime('now') WHERE id = ?`).run(req.user.businessId);
  }
  res.json({ ok: true, serverTime: new Date().toISOString() });
});

module.exports = router;
