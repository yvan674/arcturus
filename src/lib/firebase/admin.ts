import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const app =
  getApps()[0] ??
  (() => {
    const serviceAccountPath = path.resolve(
      process.cwd(),
      "firebase_adminsdk.json",
    );
    if (existsSync(serviceAccountPath)) {
      const serviceAccount = JSON.parse(
        readFileSync(serviceAccountPath, "utf8"),
      );

      return initializeApp({
        credential: cert(serviceAccount),
      });
    }
    // GCP Cloud Run doesn't need the service account json
    return initializeApp();
  })();

export const adminAuth = getAuth(app);
