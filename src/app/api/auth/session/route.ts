// app/api/auth/session/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { adminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME } from "@/lib/session-const";

const EXPIRES_IN = 1000 * 60 * 60 * 24 * 5; // 5 days

export async function POST(request: Request) {
  const { idToken } = await request.json();

  const sessionCookie = await adminAuth.createSessionCookie(idToken, {
    expiresIn: EXPIRES_IN,
  });

  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, sessionCookie, {
    maxAge: EXPIRES_IN / 1000,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  return NextResponse.json({ ok: true });
}
