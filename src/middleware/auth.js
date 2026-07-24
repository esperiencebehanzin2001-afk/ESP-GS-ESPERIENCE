const { verifyAccessToken } = require("../security");

// Vérifie le jeton d'accès (Authorization: Bearer <token>) et attache
// l'utilisateur (id, rôle, entreprise) à la requête.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Authentification requise." });
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role, businessId: payload.businessId };
    next();
  } catch (e) {
    return res.status(401).json({ error: "Session invalide ou expirée." });
  }
}

// Réserve la route au rôle "mere" (vous, le développeur / administrateur).
function requireMother(req, res, next) {
  if (!req.user || req.user.role !== "mere") {
    return res.status(403).json({ error: "Accès réservé à l'administration." });
  }
  next();
}

// Un gérant/employé ne peut agir que sur SA PROPRE entreprise, jamais sur
// l'identifiant d'une autre entreprise passé en paramètre.
function requireOwnBusinessOrMother(paramName = "businessId") {
  return (req, res, next) => {
    if (req.user.role === "mere") return next();
    const targetId = Number(req.params[paramName]);
    if (req.user.businessId !== targetId) {
      return res.status(403).json({ error: "Accès non autorisé à cette entreprise." });
    }
    next();
  };
}

module.exports = { requireAuth, requireMother, requireOwnBusinessOrMother };
