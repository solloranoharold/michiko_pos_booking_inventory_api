require("dotenv").config();
const admin = require("firebase-admin");

// Check if Firebase environment variables are available
const hasFirebaseConfig = process.env.FIREBASE_TYPE && 
                         process.env.FIREBASE_PROJECT_ID && 
                         process.env.FIREBASE_PRIVATE_KEY_ID && 
                         process.env.FIREBASE_PRIVATE_KEY && 
                         process.env.FIREBASE_CLIENT_EMAIL && 
                         process.env.FIREBASE_CLIENT_ID;

let app;

if (hasFirebaseConfig) {
  try {
    const serviceAccount = {
      "type": process.env.FIREBASE_TYPE,
      "project_id": process.env.FIREBASE_PROJECT_ID,
      "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
      "private_key": process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      "client_email": process.env.FIREBASE_CLIENT_EMAIL,
      "client_id": process.env.FIREBASE_CLIENT_ID,
      "auth_uri": process.env.FIREBASE_AUTH_URI,
      "token_uri": process.env.FIREBASE_TOKEN_URI,
      "auth_provider_x509_cert_url": process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL,
      "client_x509_cert_url": process.env.FIREBASE_CLIENT_X509_CERT_URL,
      "universe_domain": process.env.FIREBASE_UNIVERSE_DOMAIN
    };

    // Check if app is already initialized
    try {
      app = admin.app();
    } catch (error) {
      // App not initialized, create new one
      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    
    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.error('Error initializing Firebase Admin SDK:', error);
    // Create a dummy app to prevent crashes
    try {
      app = admin.app();
    } catch (initError) {
      app = admin.initializeApp({
        credential: admin.credential.applicationDefault()
      });
    }
  }
} else {
  console.warn('Firebase environment variables not found. Using default credentials.');
  try {
    app = admin.app();
  } catch (error) {
    app = admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
  }
}

module.exports = admin;