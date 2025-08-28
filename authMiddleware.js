const admin = require('./firebaseAdmin');

async function requireAuthHeader(req, res, next) {
  // Skip auth check for the registerClientPublic endpoint
  // Note: When using app.use('/api', middleware), req.path doesn't include /api prefix
  if (
    req.path.startsWith('/clients/registerClientPublic') ||
    req.originalUrl.startsWith('/api/clients/registerClientPublic') || 
    req.originalUrl.startsWith('/api/clients/getEmailClient') ||
    req.originalUrl.startsWith('/api/branches/getBranchesforClient') ||
    req.originalUrl.startsWith('/api/services/getServicesforClient') ||
    req.originalUrl.startsWith('/api/time-slots/getAvailableTimeSlotsClients') ||
    req.originalUrl.startsWith('/api/bookings/createBookingperBranchClient')
  ) {
    return next();
  }
  
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header must start with Bearer' });
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Bearer token missing' });
  }
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken; // Optionally attach user info to request
    next();
  } catch (error) {
    console.error('Error verifying ID token:', error);
    return res.status(403).json({ error: 'Unauthorized' });
  }
}

module.exports = requireAuthHeader; 