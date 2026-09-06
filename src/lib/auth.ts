import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { SESSION_COOKIE, roleAtLeast, type Role } from "@/lib/constants";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12; // 12 hours

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET must be set to a random string of at least 32 characters.",
    );
  }
  return new TextEncoder().encode(secret);
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(user: SessionUser): Promise<void> {
  const token = await new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Returns the signed-in user, or null. Never throws on an invalid cookie. */
export async function getSession(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;

    // Re-read the user so a deactivated or role-changed account loses access
    // immediately rather than at cookie expiry.
    const user = await db.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.active) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as Role,
    };
  } catch {
    return null;
  }
}

/** Requires a signed-in user, redirecting to the login page otherwise. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}

/** Requires at least the given role, throwing for authenticated-but-unauthorised. */
export async function requireRole(minimum: Role): Promise<SessionUser> {
  const user = await requireUser();
  if (!roleAtLeast(user.role, minimum)) {
    throw new Error("You do not have permission to perform this action.");
  }
  return user;
}
