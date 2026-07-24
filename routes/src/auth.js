const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");
const {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require("../security");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

// Anti-brute-force sur les tentatives de connexion : 10 essais / 15 min / IP,
// en plus du verrouillage de compte après échecs répétés (voir plus bas).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez dans quelques minutes." },
});

function logActivity(businessId, userId, type, payload) {
  db.prepare(
    `INSERT INTO activity_logs (business_id, user_id, type, payload) VALUES (?,?,?,?)`
  ).run(businessId, userId || null, type, payload ? JSON.stringify(payload) : null);
}

router.post("/login", loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "Identifiant et mot de passe requis." });
  }

  const user = db
    .prepare(`SELECT * FROM users WHERE username = ? COLLATE NOCASE`)
    .get(String(username).trim());

  if (!user) return res.status(401).json({ error: "Identifiants incorrects." });

  // Verrouillage de compte après échecs répétés (protection brute-force
  // ciblée, indépendante de l'IP).
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return res.status(423).json({ error: "Compte temporairement verrouillé suite à plusieurs échecs. Réessayez plus tard." });
  }

  // Vérification de la licence de l'entreprise (gérant/employé uniquement ;
  // le compte 'mere' n'a pas de business_id).
  if (user.business_id) {
    const business = db.prepare(`SELECT * FROM businesses WHERE id = ?`).get(user.business_id);
    if (business) {
      if (business.status === "suspended") {
        return res.status(403).json({ error: "Compte suspendu. Contactez l'administrateur." });
      }
      if (business.license_expires_at && new Date(business.license_expires_at) < new Date()) {
        return res.status(403).json({ error: "Licence expirée. Contactez l'administrateur pour la renouveler." });
      }
    }
  }

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    const attempts = user.failed_attempts + 1;
    const lockUntil =
      attempts >= 5
        ? new Date(Date.now() + 15 * 60 * 1000).toISOString()
        : null;
    db.prepare(
      `UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?`
    ).run(attempts, lockUntil, user.id);
    if (user.business_id) logActivity(user.business_id, user.id, "login_failed", { username });
    return res.status(401).json({ error: "Identifiants incorrects." });
  }

  // Connexion réussie : remise à zéro des compteurs.
  db.prepare(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = datetime('now') WHERE id = ?`
  ).run(user.id);

  if (user.business_id) {
    db.prepare(`UPDATE businesses SET last_seen_at = datetime('now') WHERE id = ?`).run(user.business_id);
    logActivity(user.business_id, user.id, "login", { username });
  }

  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  db.prepare(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?,?, datetime('now','+30 days'))`
  ).run(user.id, hashToken(refreshToken));

  res.json({
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      role: user.role,
      businessId: user.business_id,
      username: user.username,
      mustChangePassword: !!user.must_change_password,
    },
  });
});

router.post("/refresh", (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: "Jeton de rafraîchissement requis." });
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    return res.status(401).json({ error: "Session expirée, reconnectez-vous." });
  }
  const stored = db
    .prepare(`SELECT * FROM refresh_tokens WHERE token_hash = ? AND revoked = 0`)
    .get(hashToken(refreshToken));
  if (!stored || new Date(stored.expires_at) < new Date()) {
    return res.status(401).json({ error: "Session expirée, reconnectez-vous." });
  }
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(payload.sub);
  if (!user) return res.status(401).json({ error: "Utilisateur introuvable." });
  res.json({ accessToken: signAccessToken(user) });
});

router.post("/logout", requireAuth, (req, res) => {
  const { refreshToken } = req.body || {};
  if (refreshToken) {
    db.prepare(`UPDATE refresh_tokens SET revoked = 1 WHERE token_hash = ?`).run(hashToken(refreshToken));
  }
  res.json({ ok: true });
});

router.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 6 caractères." });
  }
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });

  // Si le compte ne sort pas d'une réinitialisation forcée par la mère,
  // on exige l'ancien mot de passe pour changer le nouveau.
  if (!user.must_change_password) {
    if (!currentPassword) return res.status(400).json({ error: "Mot de passe actuel requis." });
    const ok = await verifyPassword(currentPassword, user.password_hash);
    if (!ok) return res.status(401).json({ error: "Mot de passe actuel incorrect." });
  }

  const newHash = await hashPassword(newPassword);
  db.prepare(
    `UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?`
  ).run(newHash, user.id);
  if (user.business_id) logActivity(user.business_id, user.id, "password_change", {});
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  const user = db.prepare(`SELECT id, username, role, business_id FROM users WHERE id = ?`).get(req.user.id);
  if (!user) return res.status(404).json({ error: "Utilisateur introuvable." });
  let business = null;
  if (user.business_id) {
    business = db
      .prepare(`SELECT id, name, status, license_expires_at, last_seen_at FROM businesses WHERE id = ?`)
      .get(user.business_id);
  }
  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    businessId: user.business_id,
    business,
  });
});

module.exports = router;
