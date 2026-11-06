import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/(workspace)/imports/google-actions", () => ({ pickerSessionAction: vi.fn(), createGoogleFileAction: vi.fn(), readGoogleSetupAction: vi.fn(), saveGoogleSetupAction: vi.fn(), disconnectGoogleAction: vi.fn() }));
vi.mock("@/app/(workspace)/imports/connector-actions", () => ({ setConnectorPausedAction: vi.fn(), disconnectConnectorAction: vi.fn() }));
import { GoogleConnect, syncSummary, type DriveFile } from "@/components/google-connect";

const now = Date.parse("2026-11-06T09:00:00Z");
const file: DriveFile = { id: "20000000-0000-4000-8000-000000000001", label: "Fictional ledger", connector_status: "active", mapping: null,
  connector_settings: { fileId: "sheet1234567", name: "Fictional ledger", mimeType: "application/vnd.google-apps.spreadsheet", tab: "Sales" },
  last_run_at: "2026-11-06T08:58:00Z", last_run_summary: { result: "staged", counts: { staged: 4, unchanged: 12, payments: 1, choose: [7, 9] } } };
const render = (props: Partial<Parameters<typeof GoogleConnect>[0]> = {}) => renderToStaticMarkup(createElement(GoogleConnect, {
  owner: true, configured: true, connection: { account_email: "owner@fictional.example", status: "connected" }, files: [file], customers: [], checkedAt: now, ...props })).replaceAll("&#x27;", "'");

describe("Connect Google screen", () => {
  it("offers Connect Google to an owner with no connection, and tells finance to ask the owner", () => {
    expect(render({ connection: null, files: [] })).toContain('href="/api/google/connect"');
    expect(render({ connection: null, files: [], owner: false })).toContain("Ask the owner to connect Google");
    expect(render({ connection: null, files: [], owner: false })).not.toContain('href="/api/google/connect"');
  });
  it("shows the connected account and owner controls", () => {
    const html = render();
    for (const text of ["Connected as owner@fictional.example", "Choose a file", "Disconnect Google"]) expect(html).toContain(text);
    const finance = render({ owner: false });
    expect(finance).toContain("Fictional ledger");
    for (const text of ["Choose a file", "Disconnect Google", "Pause"]) expect(finance).not.toContain(text);
  });
  it("asks the owner to reconnect when Google refused the stored sign-in", () => {
    const html = render({ connection: { account_email: "owner@fictional.example", status: "needs_reconnect" } });
    expect(html).toContain("Reconnect Google");
    expect(html).toContain('href="/api/google/connect"');
  });
  it("summarises the last sync in plain words", () => {
    expect(render()).toContain("Synced 2 min ago: 4 sent to review, 12 unchanged, 1 payment to record in Collections, 2 need your choice");
    expect(syncSummary({ result: "failed", errorCode: "FILE_ACCESS_LOST", counts: {} }, "2026-11-06T08:58:00Z", now))
      .toBe("Last sync 2 min ago failed: PondoPath can't open this file anymore. Check that it still exists in your Drive.");
    expect(syncSummary(null, null, now)).toBe("Not synced yet.");
  });
  it("explains when the server is not set up and shows the sign-in result", () => {
    expect(render({ configured: false, connection: null, files: [] })).toContain("Connect Google isn't set up on this server yet.");
    expect(render({ notice: "failed" })).toContain("Google wasn't connected");
    expect(render({ notice: "connected" })).toContain("Google is connected");
  });
  it("asks the owner to finish setup for a new file", () => {
    expect(render({ files: [{ ...file, connector_status: "awaiting_first_read", last_run_at: null, last_run_summary: null }] })).toContain("Finish setup");
  });
});
