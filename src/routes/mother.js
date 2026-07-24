const express = require("express");
const db = require("../db");
const {
  hashPassword,
  randomLicenseCode,
  randomTempPassword,
  deriveBusinessRecoverySecret,
} = require("../security");
const { requireAuth, requireMother } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireMother);

// Unités de durée de licence autorisées, avec une borne haute raisonnable
// par unité (garde-fou contre une erreur de saisie du type "3000 mois").
const LICENSE_UNIT_LIMITS = { day: 365, week: 104, month: 60, year: 15 };

// Calcule la date ISO d'expiration à partir d'une unité + une valeur
// (ex: unit="day", value=1 => licence d'un seul jour, pour une vente
// ponctuelle "à la journée"). Retourne null pour une licence illimitée.
function computeLicenseExpiry(durationUnit, durationValue) {
  if (!durationUnit || durationUnit === "unlimited") {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(LICENSE_UNIT_LIMITS, durationUnit)) {
    throw new Error("INVALID_DURATION");
  }
  const value = Number(durationValue);
  if (!Number.isInteger(value) || value <= 0 || value > LICENSE_UNIT_LIMITS[durationUnit]) {
    throw new Error("INVALID_DURATION");
  }
  const d = new Date();
  if (durationUnit === "day") d.setDate(d.getDate() + value);
  else if (durationUnit === "week") d.setDate(d.getDate() + value * 7);
  else if (durationUnit === "month") d.setMonth(d.getMonth() + value);
  else if (durationUnit === "year") d.setFullYear(d.getFullYear() + value);
  return d.toISOString();
}

const DURATION_ERROR_MSG =
  "Durée de licence invalide. Choisissez une unité (jour, semaine, mois, année) avec une valeur " +
  "positive raisonnable (ex: 1 à 365 jours, 1 à 104 semaines, 1 à 60 mois, 1 à 15 ans), ou illimitée.";

// Statut de licence dérivé, calculé côté serveur pour l'affichage dans la
// console mère (illimitée / active / expire bientôt / expirée).
function licenseStatusOf(licenseExpiresAt) {
  if (!licenseExpiresAt) return "unlimited";
  const diffDays = (new Date(licenseExpiresAt) - new Date()) / 86400000;
  if (diffDays < 0) return "expired";
  if (diffDays <= 30) return "expiring_soon";
  return "active";
}

function logActivity(businessId, userId, type, payload) {
  db.prepare(
    `INSERT INTO activity_logs (business_id, user_id, type, payload) VALUES (?,?,?,?)`
  ).run(businessId, userId || null, type, payload ? JSON.stringify(payload) : null);
}

// ---- Liste des entreprises avec indicateurs de sécurité / activité ------
router.get("/businesses", (req, res) => {
  const rows = db
    .prepare(
      `SELECT b.id, b.name, b.license_code, b.status, b.license_expires_at, b.created_at, b.last_seen_at,
              (SELECT COUNT(*) FROM activity_logs a WHERE a.business_id=b.id AND a.type='login_failed'
                 AND a.created_at > datetime('now','-24 hours')) AS failed_logins_24h,
              (SELECT COUNT(*) FROM activity_logs a WHERE a.business_id=b.id
                 AND a.created_at > datetime('now','-24 hours')) AS events_24h
       FROM businesses b ORDER BY b.name COLLATE NOCASE`
    )
    .all();
  res.json({
    businesses: rows.map((b) => ({ ...b, licenseStatus: licenseStatusOf(b.license_expires_at) })),
  });
});

// ---- Créer une nouvelle entreprise (génère licence + compte gérant) ----
router.post("/businesses", async (req, res) => {
  const { name, gerantUsername, durationUnit, durationValue } = req.body || {};
  if (!name || !gerantUsername) {
    return res.status(400).json({ error: "Nom de l'entreprise et identifiant du gérant requis." });
  }

  let licenseExpiresAt;
  try {
    licenseExpiresAt = computeLicenseExpiry(durationUnit, durationValue);
  } catch {
    return res.status(400).json({ error: DURATION_ERROR_MSG });
  }

  const licenseCode = randomLicenseCode(name);
  const tempPassword = randomTempPassword();

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO businesses (name, license_code, recovery_secret, license_expires_at) VALUES (?, ?, '', ?)`
      )
      .run(name.trim(), licenseCode, licenseExpiresAt);
    const businessId = info.lastInsertRowid;
    const recoverySecret = deriveBusinessRecoverySecret(businessId);
    db.prepare(`UPDATE businesses SET recovery_secret = ? WHERE id = ?`).run(recoverySecret, businessId);
    return { businessId, recoverySecret };
  });

  try {
    const { businessId, recoverySecret } = tx();
    const passwordHash = await hashPassword(tempPassword);
    db.prepare(
      `INSERT INTO users (business_id, username, password_hash, role, must_change_password)
       VALUES (?,?,?,?,1)`
    ).run(businessId, gerantUsername.trim(), passwordHash, "gerant");

    logActivity(businessId, req.user.id, "other", { action: "license_created", licenseExpiresAt });

    res.status(201).json({
      businessId,
      licenseCode,
      licenseExpiresAt, // null = illimitée
      gerantUsername: gerantUsername.trim(),
      temporaryPassword: tempPassword, // à communiquer une seule fois, changement forcé à la 1ère connexion
      recoverySecret, // à intégrer dans l'exemplaire distribué à CETTE entreprise uniquement
    });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "Ce nom d'entreprise existe déjà." });
    }
    res.status(500).json({ error: "Erreur lors de la création." });
  }
});

// ---- Renouveler / modifier la durée de licence d'une entreprise --------
router.patch("/businesses/:id/license", (req, res) => {
  const { durationUnit, durationValue } = req.body || {};
  const business = db.prepare(`SELECT * FROM businesses WHERE id = ?`).get(req.params.id);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable." });

  let licenseExpiresAt;
  try {
    licenseExpiresAt = computeLicenseExpiry(durationUnit, durationValue);
  } catch {
    return res.status(400).json({ error: DURATION_ERROR_MSG });
  }

  db.prepare(`UPDATE businesses SET license_expires_at = ? WHERE id = ?`).run(licenseExpiresAt, business.id);
  logActivity(business.id, req.user.id, "other", { action: "license_renewed", licenseExpiresAt });
  res.json({ ok: true, licenseExpiresAt, licenseStatus: licenseStatusOf(licenseExpiresAt) });
});

router.patch("/businesses/:id/status", (req, res) => {
  const { status } = req.body || {};
  if (!["active", "suspended"].includes(status)) {
    return res.status(400).json({ error: "Statut invalide." });
  }
  db.prepare(`UPDATE businesses SET status = ? WHERE id = ?`).run(status, req.params.id);
  logActivity(req.params.id, req.user.id, "other", { action: "status_change", status });
  res.json({ ok: true });
});

// ---- Réinitialisation de mot de passe à distance (en ligne) -------------
router.post("/businesses/:id/reset-password", async (req, res) => {
  const business = db.prepare(`SELECT * FROM businesses WHERE id = ?`).get(req.params.id);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable." });

  const user = db
    .prepare(`SELECT * FROM users WHERE business_id = ? AND role = 'gerant' LIMIT 1`)
    .get(business.id);
  if (!user) return res.status(404).json({ error: "Compte gérant introuvable pour cette entreprise." });

  const tempPassword = randomTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  db.prepare(
    `UPDATE users SET password_hash = ?, must_change_password = 1, failed_attempts = 0, locked_until = NULL WHERE id = ?`
  ).run(passwordHash, user.id);

  db.prepare(
    `UPDATE password_reset_requests SET status='completed', completed_at=datetime('now')
     WHERE business_id = ? AND status='pending'`
  ).run(business.id);

  logActivity(business.id, req.user.id, "password_reset", { by: "mere" });

  res.json({
    username: user.username,
    temporaryPassword: tempPassword, // à communiquer une seule fois au gérant, par un canal sûr
  });
});

// ---- Générer un code de déblocage hors-ligne (sans connexion) -----------
router.post("/businesses/:id/offline-unlock-code", (req, res) => {
  const { challenge } = req.body || {};
  if (!challenge) return res.status(400).json({ error: "Le code affiché par l'application (challenge) est requis." });
  const business = db.prepare(`SELECT * FROM businesses WHERE id = ?`).get(req.params.id);
  if (!business) return res.status(404).json({ error: "Entreprise introuvable." });

  const { computeOfflineUnlockCode } = require("../security");
  const code = computeOfflineUnlockCode(business.recovery_secret, challenge.trim().toUpperCase());
  logActivity(business.id, req.user.id, "other", { action: "offline_unlock_code_generated" });
  res.json({ unlockCode: code, validForDay: new Date().toISOString().slice(0, 10) });
});

// ---- Demandes de réinitialisation en attente (déclenchées par les boutiques) ----
router.get("/reset-requests", (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.business_id, b.name AS business_name, r.status, r.created_at
       FROM password_reset_requests r JOIN businesses b ON b.id = r.business_id
       WHERE r.status = 'pending' ORDER BY r.created_at DESC`
    )
    .all();
  res.json({ requests: rows });
});

// ---- Journal de sécurité / activité, toutes entreprises confondues ------
router.get("/security-log", (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.id, a.business_id, b.name AS business_name, a.type, a.payload, a.created_at
       FROM activity_logs a JOIN businesses b ON b.id = a.business_id
       WHERE a.type IN ('login_failed','password_reset','password_change','lock','unlock')
       ORDER BY a.created_at DESC LIMIT 200`
    )
    .all();
  res.json({ events: rows });
});

module.exports = router;
