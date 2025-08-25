const path = require('path');

// Utility function to resolve paths consistently across environments
function resolvePath(relativePath) {
    return path.join(__dirname, relativePath);
}

// Export commonly used paths
module.exports = {
    resolvePath,
    firebaseAdmin: resolvePath('./firebaseAdmin'),
    emailService: resolvePath('./service/emailService'),
    calendarRateLimiter: resolvePath('./calendar-rate-limiter'),
    config: resolvePath('./config/env'),
    authMiddleware: resolvePath('./authMiddleware'),
    verifyToken: resolvePath('./verifyToken')
}; 