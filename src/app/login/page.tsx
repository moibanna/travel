import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSession()) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-lg bg-brand text-lg font-semibold text-white">
            TL
          </div>
          <h1 className="text-lg font-semibold text-ink">Travel Logistics</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Movement tracking and transfer coordination
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
