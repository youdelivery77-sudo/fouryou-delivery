const { admin } = require("../config/firebase");

/**
 * Middleware للتحقق من Firebase Auth Token
 * الفرونت يبعت: Authorization: Bearer <idToken>
 */
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "مش مسجل دخول" });
  }

  const token = header.split(" ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    req.email = decoded.email;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token غير صالح" });
  }
}

module.exports = authMiddleware;
