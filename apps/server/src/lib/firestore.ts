import admin from "firebase-admin";
import { config } from "./config";

// initialize once — firebase-admin throws if you call initializeApp() twice
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.FIREBASE_PROJECT_ID,
      clientEmail: config.FIREBASE_CLIENT_EMAIL,
      // the private key comes in as a single-line string with literal \n — expand them
      privateKey: config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
}

export const db = admin.firestore();
export { admin };
