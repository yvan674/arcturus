"use client";

import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "@/lib/firebase/client-app";

export async function login(email: string, password: string) {
  const credentials = await signInWithEmailAndPassword(auth, email, password);

  const idToken = await credentials.user.getIdToken();

  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) {
    throw new Error("Failed to create session cookie");
  }

  // immediately signout so we handle login without firebase
  await auth.signOut();
}
