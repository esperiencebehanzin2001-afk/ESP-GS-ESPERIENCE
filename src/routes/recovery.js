const express = require("express");
const rateLimit = require("express-rate-limit");
const db = require("../db");

const router = express.Router();

const recoveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Trop de demandes. Réessayez plus tard ou contactez directement votre prestataire." },
});

// Une boutique qui a perdu l'accès (mot de passe oublié, plus connectée)
// peut signaler une demande de réinitialisation par nom d'entreprise +
// code de licence (déjà en sa possession), SANS avoir besoin d'être
// authentifiée. La demande apparaît dans la console mère ; c'est ensuite
// vous, manuellement, qui déclenchez la réinitialisation réelle après
// avoir vérifié l'identité de la personne (par téléphone par exemple).
router.post("/request", recoveryLimiter, (req, res) => {
  const { businessName, licenseCode } = req.body || {};
  if (!businessName || !licenseCode) {
    return res.status(400).json({ error: "Nom de l'entreprise et code de licence requis." });
  }
  const business = db
    .prepare(`SELECT * FROM businesses WHERE name = ? COLLATE NOCASE AND license_code = ?`)
    .get(businessName.trim(), licenseCode.trim().toUpperCase());

  // Réponse volontairement identique que la demande existe ou non, pour ne
  // pas laisser un tiers deviner quelles entreprises sont enregistrées.
  if (business) {
    db.prepare(
      `INSERT INTO password_reset_requests (business_id, status) VALUES (?, 'pending')`
    ).run(business.id);
  }
  res.json({ ok: true, message: "Si les informations sont correctes, votre demande a été transmise à l'administrateur." });
});

module.exports = router;
