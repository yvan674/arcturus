import { cookies } from "next/headers";
import { adminAuth } from "./firebase/admin";
import { SESSION_COOKIE_NAME } from "./session-const";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) return null;

  try {
    return await adminAuth.verifySessionCookie(sessionCookie, true);
  } catch (error) {
    console.error("Error verifying session cookie:", error);
    return null;
  }
}
