import admin from 'firebase-admin';
import path from 'path';
import fs from 'fs';
import { logger } from './logger.js';

let isInitialized = false;

function loadServiceAccount(): admin.ServiceAccount | null {
  const envCredentials = process.env.FIREBASE_SERVICE_ACCOUNT;
  
  if (envCredentials) {
    try {
      return JSON.parse(envCredentials) as admin.ServiceAccount;
    } catch {
      const decoded = Buffer.from(envCredentials, 'base64').toString('utf-8');
      return JSON.parse(decoded) as admin.ServiceAccount;
    }
  }

  const serviceAccountPath = path.resolve(process.cwd(), 'firebase-service-account.json');
  if (fs.existsSync(serviceAccountPath)) {
    const fileContent = fs.readFileSync(serviceAccountPath, 'utf-8');
    return JSON.parse(fileContent) as admin.ServiceAccount;
  }

  return null;
}

export const initializeFirebase = () => {
  if (isInitialized) return;

  try {
    const serviceAccount = loadServiceAccount();

    if (!serviceAccount) {
      if (logger) {
        logger.warn('Firebase Service Account nao encontrada. Push notifications desativadas.');
      } else {
        console.warn('Firebase Service Account nao encontrada. Push notifications desativadas.');
      }
      return;
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });

    isInitialized = true;
    if (logger) {
      logger.info('Firebase Admin SDK inicializado.');
    } else {
      console.log('Firebase Admin SDK inicializado.');
    }
  } catch (error) {
    if (logger) {
      logger.error({ err: error }, 'Falha ao inicializar Firebase Admin SDK');
    } else {
      console.error('Falha ao inicializar Firebase Admin SDK', error);
    }
  }
};

export const getFirebaseAdmin = () => {
  if (!isInitialized) {
    initializeFirebase();
  }
  return admin;
};

