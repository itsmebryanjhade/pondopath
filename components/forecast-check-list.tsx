import Link from "next/link";
import type { ForecastCheck } from "@/lib/ui/forecast-checks";
import { DashboardIcon } from "./dashboard-icon";

/** The forecast's assumptions in plain words, shared by the Overview and Forecast pages. */
/** Shows up to `limit` records per check, then "and N more" with a link to the full list. */
export function ForecastCheckList({ checks, limit = 5, empty }: { checks: ForecastCheck[]; limit?: number; empty?: string }) {
  return (
    <div className="forecast-checks">
      {checks.map((check) => <section key={check.key} className="forecast-check" aria-labelledby={`check-${check.key}`}>
        <h3 id={`check-${check.key}`}>{check.title}</h3>
        <p className="muted">{check.note}</p>
        <ul>{check.records.slice(0, limit).map((record) => <li key={record.id}>
          <span><strong>{record.label}</strong><small>{record.detail}</small></span>
          <Link className="row-action" href={record.href}>{record.action}<DashboardIcon name="arrowRight" size={14} /></Link>
        </li>)}</ul>
        {check.records.length > limit && <p className="check-more">and {check.records.length - limit} more</p>}
        {check.more && <Link className="text-link" href={check.more.href}>{check.more.label}</Link>}
      </section>)}
      {!checks.length && <p className="muted">{empty ?? "No past payment dates and no overdue bills. The forecast only knows what you’ve recorded."}</p>}
      <p className="forecast-check-rule">A promise isn&rsquo;t money received. Check your bank before marking anything paid.</p>
    </div>
  );
}
