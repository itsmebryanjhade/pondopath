import Link from "next/link";
import { DM_Sans } from "next/font/google";
import type { ReactNode } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { signOut } from "@/app/login/actions";
import { ProductBrand } from "./product-brand";
import { RefreshRecords } from "./refresh-records";
import { AppIcon } from "./app-icon";

const font = DM_Sans({ subsets: ["latin"], display: "swap" });

const destinations = [
  { href: "/overview", label: "Cash overview", icon: "bar-chart-2" },
  { href: "/invoices", label: "Customer invoices", icon: "file-text" },
  { href: "/expenses", label: "Expenses & payments", icon: "credit-card" },
] as const;

export function WorkspaceShell({
  workspace,
  active,
  children,
  header,
}: {
  workspace: WorkspaceSnapshot;
  active: string;
  children: ReactNode;
  header?: ReactNode;
}) {
  const navigation = (
    <nav aria-label="Cash planning">
      <ul>
        {destinations.map((item) => (
          <li key={item.href}>
            <Link href={item.href} aria-current={active === item.href ? "page" : undefined}>
              <AppIcon name={item.icon} />{item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
  const role = workspace.actor.role === "owner" ? "Owner" : "Finance staff";
  return (
    <div data-ui className={`${font.className} workspace`}>
      <a className="skip-link" href="#workspace-main">
        Skip to cash plan
      </a>
      <aside className="workspace-sidebar">
        <ProductBrand />
        {navigation}
        <div className="account-controls">
          <div className="workspace-business"><p>{workspace.business.name}</p><span>{role}</span></div>
          {workspace.actor.role === "owner" && <Link className="account-action" href="/team"><AppIcon name="users" />Invite a teammate</Link>}
          <form action={signOut}>
            <button className="account-action"><AppIcon name="log-out" />Sign out</button>
          </form>
        </div>
      </aside>
      <header className="mobile-header">
        <ProductBrand />
        <details>
          <summary>Menu</summary>
          <div className="mobile-menu">
            <p>
              {workspace.business.name} · {role}
            </p>
            {navigation}
            {workspace.actor.role === "owner" && <Link className="account-action" href="/team"><AppIcon name="users" />Invite a teammate</Link>}
            <form action={signOut}>
              <button className="account-action"><AppIcon name="log-out" />Sign out</button>
            </form>
          </div>
        </details>
      </header>
      <main id="workspace-main" tabIndex={-1} className="workspace-main">
        {header ?? <div className="workspace-stamp">
          <div>
            <p className="workspace-date">
              <span className="workspace-context">{workspace.business.is_demo ? "Fictional demo" : workspace.business.name}</span>
              Cash plan as of <strong>{workspace.forecastInput.referenceDate}</strong>
            </p>
            <p className="muted">
              Opening cutoff {workspace.business.opening_date} · Asia/Manila · Revision{" "}
              {workspace.revision}
            </p>
          </div>
          <RefreshRecords />
        </div>}
        {children}
        <footer className="workspace-footer">
          Records loaded{" "}
          {new Date().toLocaleString("en-PH", {
            timeZone: "Asia/Manila",
            dateStyle: "medium",
            timeStyle: "short",
          })}{" "}
          (Asia/Manila) · Revision {workspace.revision} · Opening cutoff {workspace.business.opening_date}. Forecasts reflect entered records and reviewed assumptions; expected
          receipts are not available cash.
        </footer>
      </main>
    </div>
  );
}
