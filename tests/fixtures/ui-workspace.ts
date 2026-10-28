import type { WorkspaceSnapshot } from "../../lib/server/workspace";
import { delayedCase } from "./business";

export function uiWorkspace(): WorkspaceSnapshot {
  const forecastInput = delayedCase();
  forecastInput.referenceDate = "2026-10-29";
  const businessId = "40000000-0000-4000-8000-000000000001";
  const userId = "50000000-0000-4000-8000-000000000001";
  const customerId = "60000000-0000-4000-8000-000000000001";
  const timestamp = "2026-10-29T00:00:00Z";
  return {
    actor: { userId, businessId, role: "owner" }, revision: 1,
    business: { id: businessId, name: "SoloForge Demo Services", ai_daily_limit: 5, created_at: timestamp, currency: "PHP", demo_reference_date: "2026-10-29", is_demo: true, opening_cash_cents: 4_000_000, opening_date: "2026-10-29", opening_locked_at: null, revision: 1 },
    members: [{ user_id: userId, display_name: "Jamie Doe", role: "owner" }],
    customers: [{ id: customerId, business_id: businessId, name: "Demo customer", contact_name: "Demo contact", email: null, phone: null, version: 1, created_at: timestamp, updated_at: timestamp }],
    invoices: [{ id: forecastInput.invoices[0].id, business_id: businessId, customer_id: customerId, number: "DEMO-001", amount_cents: 5_000_000, outstanding_cents: 5_000_000, paid_cents: 0, due_date: "2026-10-28", version: 1, created_at: timestamp, updated_at: timestamp }],
    expenses: forecastInput.expenses.map((expense, i) => ({ id: expense.id, business_id: businessId, amount_cents: expense.unpaidCents, unpaid_cents: expense.unpaidCents, paid_cents: 0, due_date: expense.dueDate, label: ["Payroll", "Supplier bill", "Rent"][i], payee: ["Demo team", "Demo supplier", "Demo landlord"][i], version: 1, created_at: timestamp, updated_at: timestamp })),
    expectations: [], followups: [], reminders: [], automation: { lastSuccessAt: timestamp, stale: false }, forecastInput,
  };
}
