"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { createSession, destroySession, verifyPassword } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import type { Role } from "@/lib/constants";

const credentialsSchema = z.object({
  email: z.string().trim().min(1, "Enter your email address").toLowerCase(),
  password: z.string().min(1, "Enter your password"),
});

export type LoginState = { error?: string };

export async function login(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });

  // The same message covers unknown email, wrong password and deactivated
  // account so the form cannot be used to discover which emails exist.
  const invalid = { error: "Email or password is incorrect." };
  if (!user || !user.active) return invalid;
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) return invalid;

  const sessionUser = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
  };

  await createSession(sessionUser);
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await recordAudit({
    user: sessionUser,
    action: "LOGIN",
    entity: "User",
    entityId: user.id,
    summary: `${user.name} signed in`,
  });

  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
