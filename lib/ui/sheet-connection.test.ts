import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/app/(workspace)/actions", () => ({ executeWorkspaceAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/imports/connector-actions", () => ({ createSheetConnectionAction: vi.fn(), saveConnectorMappingAction: vi.fn(), setConnectorPausedAction: vi.fn(), replaceConnectorKeyAction: vi.fn(), disconnectConnectorAction: vi.fn() }));
vi.mock("@/app/(workspace)/imports/actions", () => ({ inspectCsvAction: vi.fn(), previewCsvAction: vi.fn(), stageCsvAction: vi.fn(), createCsvSourceAction: vi.fn() }));
import { SheetConnection, OneTimeConnectionKey, type SheetSource } from "@/components/sheet-connection";
const now = Date.parse("2026-11-06T09:00:00Z");
const source: SheetSource = { id: "20000000-0000-4000-8000-000000000001", label: "Fictional Sheet", created_at: "2026-11-06T08:50:00Z", connector_status: "active", mapping: null, connector_settings: { intervalMinutes: 10, headers: ["ID", "Amount"], samples: [["00042", 12.5]] }, last_run_at: "2026-11-06T08:55:00Z", last_run_summary: { result: "staged", counts: { staged: 3, unchanged: 40, skippedByFilter: 2, invalid: [], missing: 0 } } };
function render(owner = true, values: SheetSource[] = [source]) { return renderToStaticMarkup(createElement(SheetConnection, { owner, sources: values, serviceAccountEmail: "robot@fictional.example", customers: [], checkedAt: now })); }
describe("Google Sheet connection controls", () => {
  it("gives owners setup and management controls while finance sees status only", () => {
    const owner = render();
    for (const text of ["Connect a Google Sheet", "robot@fictional.example", "Copy email", "Viewer", "Pause connection", "Replace key", "Disconnect"]) expect(owner).toContain(text);
    const finance = render(false);
    expect(finance).toContain("Fictional Sheet");
    expect(finance).toContain("3 sent to review");
    for (const text of ["Connect a Google Sheet", "Copy email", "Pause connection", "Replace key", "Disconnect", "Save mapping"]) expect(finance).not.toContain(text);
  });
  it("shows the newly created key with an explicit one-time warning and manual-copy fallback", () => {
    const html = renderToStaticMarkup(createElement(OneTimeConnectionKey, { sourceId: source.id, value: "fictional-key-only", onDismiss: () => {} }));
    expect(html).toContain("Copy this key now. It will not be shown again.");
    expect(html).toContain("fictional-key-only");
    expect(html).toMatch(/readonly/i);
    expect(html).toContain("Copy key");
    expect(html).toContain("I saved the key");
    expect(render()).not.toContain("fictional-key-only");
  });
  it("waits for the first read, then offers the shared mapping controls and real samples", () => {
    expect(render(true, [{ ...source, connector_status: "awaiting_first_read", last_run_at: null }])).toContain("Waiting for the first read from n8n");
    const html = render(true, [{ ...source, connector_status: "awaiting_mapping" }]);
    for (const text of ["00042", "12.5", "Save mapping", "Mixed (by Type column)", "Only include rows where"]) expect(html).toContain(text);
    expect(render(false, [{ ...source, connector_status: "awaiting_mapping" }])).not.toContain("Save mapping");
  });
  it("shows useful status, pause, missing-row and access-error messages", () => {
    expect(render()).toContain("40 unchanged");
    expect(render()).toContain("2 skipped by filter");
    expect(render(true, [{ ...source, connector_status: "paused" }])).toContain("Paused by owner");
    expect(render(true, [{ ...source, last_run_at: "2026-11-06T08:00:00Z" }])).toContain("No read since");
    expect(render(true, [{ ...source, last_run_summary: { result: "failed", errorCode: "SHEET_ACCESS_DENIED" } }])).toContain("share it with the robot email as Viewer");
    expect(render(true, [{ ...source, last_run_summary: { result: "failed", errorCode: "MAPPING_HEADER_MISSING" } }])).toContain("update the mapping");
  });
});

describe("Google Sheet connection review fixes", () => {
  const mapped: SheetSource = { ...source, connector_settings: { intervalMinutes: 10, headers: ["ID", "Invoice", "Amount", "Due", "Status"], samples: [] },
    mapping: { kind: "invoice", externalId: "ID", number: "Invoice", amount: "Amount", dueDate: "Due", customerId: "30000000-0000-4000-8000-000000000001", filter: { column: "Status", value: "Unpaid" } } };
  it("names the missing column when a mapped header is gone", () => {
    const html = render(true, [{ ...mapped, last_run_summary: { result: "failed", errorCode: "MAPPING_HEADER_MISSING", counts: { missingHeaders: ["Invoice"] } } }]);
    expect(html).toContain("Column ‘Invoice’ not found — update the mapping.");
  });
  it("preloads the saved mapping, including the row filter, when updating columns", () => {
    const html = renderToStaticMarkup(createElement(SheetConnection, { owner: true, sources: [mapped], serviceAccountEmail: "robot@fictional.example", customers: [{ id: "30000000-0000-4000-8000-000000000001", name: "Fictional Customer" }], checkedAt: now }));
    expect(html).toMatch(/<option selected="">ID<\/option>/);
    expect(html).toMatch(/<option value="30000000-0000-4000-8000-000000000001" selected="">Fictional Customer<\/option>/);
    expect(html).toMatch(/<option selected="">Status<\/option>/);
    expect(html).toContain('value="Unpaid"');
  });
});
