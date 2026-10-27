import Link from "next/link";
import type { ReactNode } from "react";
import type { WorkspaceSnapshot } from "@/lib/server/workspace";
import { signOut } from "@/app/login/actions";
import { ProductBrand } from "./product-brand";
import { RefreshRecords } from "./refresh-records";

const destinations = [
  { href: "/overview", label: "Cash overview" },
  { href: "/invoices", label: "Customer invoices" },
  { href: "/expenses", label: "Expenses & payments" },
];

export function WorkspaceShell({
  workspace,
  active,
  children,
}: {
  workspace: WorkspaceSnapshot;
  active: string;
  children: ReactNode;
}) {
  const navigation = (
    <nav aria-label="Cash planning">
      <ul>
        {destinations.map((item) => (
          <li key={item.href}>
            <Link href={item.href} aria-current={active === item.href ? "page" : undefined}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
  const role = workspace.actor.role === "owner" ? "Owner" : "Finance staff";
  return (
    <div data-ui className="workspace">
      <a className="skip-link" href="#workspace-main">
        Skip to cash plan
      </a>
      <aside className="workspace-sidebar">
        <ProductBrand />
        <p className="workspace-business">{workspace.business.name}</p>
        {navigation}
        <div className="account-controls">
          <p>{role}</p>
          <form action={signOut}>
            <button className="button secondary">Sign out</button>
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
            <form action={signOut}>
              <button className="button secondary">Sign out</button>
            </form>
          </div>
        </details>
      </header>
      <main id="workspace-main" tabIndex={-1} className="workspace-main">
        <div className="workspace-stamp">
          <div>
            <p>
              {workspace.business.is_demo ? "Fictional demo" : workspace.business.name} · Financial
              date <strong>{workspace.forecastInput.referenceDate}</strong>
            </p>
            <p className="muted">
              Opening cutoff {workspace.business.opening_date} · Asia/Manila · Revision{" "}
              {workspace.revision}
            </p>
          </div>
          <RefreshRecords />
        </div>
        {children}
        <footer className="workspace-footer">
          Records loaded{" "}
          {new Date().toLocaleString("en-PH", {
            timeZone: "Asia/Manila",
            dateStyle: "medium",
            timeStyle: "short",
          })}{" "}
          (Asia/Manila). Forecasts reflect entered records and reviewed assumptions; expected
          receipts are not available cash.
        </footer>
      </main>
    </div>
  );
}
