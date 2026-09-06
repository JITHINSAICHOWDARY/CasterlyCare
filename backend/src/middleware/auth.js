const jwt = require('jsonwebtoken');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header.' });
  }
  const token = header.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }

  /*
   * The JWT itself is valid for up to 7 days, but the account it
   * refers to may have been deactivated by an admin in the
   * meantime (e.g. a doctor taken off the roster). Without this
   * check, a deactivated account keeps full API access for the
   * remaining lifetime of any token it already holds, which
   * defeats the purpose of "deactivate". This costs one indexed
   * lookup per request, which is an acceptable tradeoff for a
   * stateless-JWT setup that has no separate token revocation
   * list.
   */
  try {
    // Required here (not at module scope) to avoid a require
    // cycle between middleware/auth.js and models/index.js.
    const { User } = require('../models');

    const user = await User.findByPk(payload.id, {
      attributes: ['id', 'isActive'],
    });

    if (!user || !user.isActive) {
      return res.status(403).json({
        error: 'This account has been deactivated. Please contact the hospital administrator.',
      });
    }
  } catch (err) {
    console.error('Authenticate: account status check failed:', err);
    return res.status(500).json({ error: 'Unable to verify account status.' });
  }

  req.user = payload; // { id, role, email, name }
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have permission to access this resource.' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
