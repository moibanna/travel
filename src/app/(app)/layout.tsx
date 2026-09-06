import { requireUser } from "@/lib/auth";
import { roleAtLeast } from "@/lib/constants";
import { logout } from "@/app/actions/auth";
import { NavLink } from "@/components/nav-link";

const NAV = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/movements", label: "Movements" },
  { href: "/pob", label: "Persons on board" },
  { href: "/manifest", label: "Daily manifest" },
  { href: "/passengers", label: "Passengers" },
];

const ADMIN_NAV = [
  { href: "/import", label: "Import from Excel" },
  { href: "/audit", label: "Audit trail" },
  { href: "/settings", label: "Settings" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const canManage = roleAtLeast(user.role, "COORDINATOR");

  return (
    <div className="min-h-screen lg:flex">
      <aside className="no-print border-b border-line bg-surface lg:h-screen lg:w-60 lg:shrink-0 lg:overflow-y-auto lg:border-r lg:border-b-0">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-sm font-semibold text-white">
            TL
          </span>
          <span className="text-sm font-semibold text-ink">Travel Logistics</span>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:overflow-visible">
          {NAV.map((item) => (
            <NavLink key={item.href} href={item.href} exact={item.exact}>
              {item.label}
            </NavLink>
          ))}

          {canManage && (
            <>
              <p className="mt-4 hidden px-3 pb-1 text-xs font-semibold tracking-wide text-ink-soft uppercase lg:block">
                Administration
              </p>
              {ADMIN_NAV.map((item) => (
                <NavLink key={item.href} href={item.href}>
                  {item.label}
                </NavLink>
              ))}
            </>
          )}
        </nav>

        <div className="mt-auto border-t border-line px-4 py-3 lg:sticky lg:bottom-0 lg:bg-surface">
          <p className="truncate text-sm font-medium text-ink">{user.name}</p>
          <p className="truncate text-xs text-ink-soft">{user.email}</p>
          <form action={logout} className="mt-2">
            <button
              type="submit"
              className="text-xs font-medium text-ink-soft underline underline-offset-2 hover:text-danger"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{children}</main>
    </div>
  );
}
