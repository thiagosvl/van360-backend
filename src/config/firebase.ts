import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import { logger } from './logger.js'; // Assuming logger exists, I'll fallback to console if not

let isInitialized = false;

export const initializeFirebase = () => {
  if (isInitialized) return;

  try {
    const serviceAccountPath = path.resolve(process.cwd(), 'firebase-service-account.json');
    
    if (!fs.existsSync(serviceAccountPath)) {
      if (logger) logger.warn('firebase-service-account.json not found. Push notifications will be disabled.');
      else console.warn('firebase-service-account.json not found. Push notifications will be disabled.');
      return;
    }

    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf-8'));

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    isInitialized = true;
    if (logger) logger.info('Firebase Admin SDK initialized successfully.');
    else console.log('Firebase Admin SDK initialized successfully.');
  } catch (error) {
    if (logger) logger.error({ err: error }, 'Failed to initialize Firebase Admin SDK');
    else console.error('Failed to initialize Firebase Admin SDK', error);
  }
};

export const getFirebaseAdmin = () => {
  if (!isInitialized) {
    initializeFirebase();
  }
  return admin;
};
