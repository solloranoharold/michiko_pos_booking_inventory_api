const admin = require("firebase-admin");
const config = require('./config/env');

// Check if Firebase environment variables are available
const hasFirebaseConfig = config.firebase.type && 
                         config.firebase.projectId && 
                         config.firebase.privateKeyId && 
                         config.firebase.privateKey && 
                         config.firebase.clientEmail && 
                         config.firebase.clientId;

let app;

if (hasFirebaseConfig) {
  try {
    const serviceAccount = {
      "type": config.firebase.type,
      "project_id": config.firebase.projectId,
      "private_key_id": config.firebase.privateKeyId,
      "private_key": config.firebase.privateKey,
      "client_email": config.firebase.clientEmail,
      "client_id": config.firebase.clientId,
      "auth_uri": config.firebase.authUri,
      "token_uri": config.firebase.tokenUri,
      "auth_provider_x509_cert_url": config.firebase.authProviderX509CertUrl,
      "client_x509_cert_url": config.firebase.clientX509CertUrl,
      "universe_domain": config.firebase.universeDomain
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