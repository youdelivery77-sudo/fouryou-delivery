const admin = require("firebase-admin");

// تأكد إنك حاطط FIREBASE_SERVICE_ACCOUNT في environment variables
// اعمل Service Account من Firebase Console → Project Settings → Service Accounts
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

module.exports = { db, admin };
