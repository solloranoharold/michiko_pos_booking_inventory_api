const admin = require('./firebaseAdmin');

async function verifyToken(req, res) {
  const authHeader = req.headers.authorization || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  if (!idToken) {
    return res.status(401).send('No token provided');
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;
    res.status(200).json({ uid });
  } catch (error) {
    console.error('Error verifying ID token:', error);
    res.status(403).send('Unauthorized');
  }
}

module.exports = verifyToken; 