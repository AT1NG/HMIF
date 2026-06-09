// server/middleware.js — Auth middleware
function requireLogin(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ success: false, message: 'Silakan login terlebih dahulu.' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ success: false, message: 'Silakan login terlebih dahulu.' });
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya admin.' });
  }
  next();
}

module.exports = { requireLogin, requireAdmin };
