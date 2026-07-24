const express = require("express");
const db = require("../db");
const { requireAuth, requireOwnBusinessOrMother } = require("../middleware/auth");

const router = express.Router();

// Formate une date JS au même format que SQLite datetime('now') :
// "AAAA-MM-JJ HH:MM:SS" en UTC (pas de 'T', pas de 'Z', pas de millisecondes).
// Indispensable : une comparaison BETWEEN sur du texte est sensible au
// format, "2026-07-20 11:19:45" et "2026-07-20T11:19:45.000Z" ne se
// comparent pas correctement bien qu'ils représentent le même instant.
function toSqliteUtc(date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

// Bornes de dates SQLite selon la période demandée (toujours en UTC, pour
// correspondre à ce que SQLite écrit avec datetime('now')).
function boundsFor(period, ref) {
  const d = ref ? new Date(ref) : new Date();
  const start = new Date(d);
  const end = new Date(d);
  if (period === "daily") {
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCHours(23, 59, 59, 999);
  } else if (period === "weekly") {
    const day = (start.getUTCDay() + 6) % 7; // lundi = 0
    start.setUTCDate(start.getUTCDate() - day);
    start.setUTCHours(0, 0, 0, 0);
    end.setTime(start.getTime());
    end.setUTCDate(end.getUTCDate() + 6);
    end.setUTCHours(23, 59, 59, 999);
  } else if (period === "monthly") {
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCMonth(end.getUTCMonth() + 1, 0);
    end.setUTCHours(23, 59, 59, 999);
  } else if (period === "annual") {
    start.setUTCMonth(0, 1);
    start.setUTCHours(0, 0, 0, 0);
    end.setUTCMonth(11, 31);
    end.setUTCHours(23, 59, 59, 999);
  } else {
    throw new Error("Période invalide");
  }
  return { start: toSqliteUtc(start), end: toSqliteUtc(end) };
}

function buildReport(businessId, period, ref) {
  const { start, end } = boundsFor(period, ref);

  const sales = db
    .prepare(
      `SELECT COUNT(*) AS count, COALESCE(SUM(amount),0) AS total
       FROM activity_logs WHERE business_id=? AND type='sale' AND created_at BETWEEN ? AND ?`
    )
    .get(businessId, start, end);

  const stockMovements = db
    .prepare(
      `SELECT COUNT(*) AS count FROM activity_logs
       WHERE business_id=? AND type='stock_movement' AND created_at BETWEEN ? AND ?`
    )
    .get(businessId, start, end);

  const logins = db
    .prepare(
      `SELECT
         SUM(CASE WHEN type='login' THEN 1 ELSE 0 END) AS successful,
         SUM(CASE WHEN type='login_failed' THEN 1 ELSE 0 END) AS failed
       FROM activity_logs WHERE business_id=? AND created_at BETWEEN ? AND ?`
    )
    .get(businessId, start, end);

  return {
    period,
    range: { start, end },
    ventes: { nombre: sales.count, montantTotal: sales.total },
    mouvementsStock: stockMovements.count,
    connexions: { reussies: logins.successful || 0, echouees: logins.failed || 0 },
  };
}

router.get("/:businessId/:period", requireAuth, requireOwnBusinessOrMother("businessId"), (req, res) => {
  try {
    const report = buildReport(Number(req.params.businessId), req.params.period, req.query.date);
    res.json(report);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
