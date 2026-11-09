import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AssigneeField, CommandForm } from "@/components/command-form";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("command form layout and assignee", () => {
  it("renders the form with the stacked record-form layout, not a two-column grid", () => {
    const html = renderToStaticMarkup(
      createElement(CommandForm, { revision: 1, build: () => ({ type: "save_followup" as const, payload: {} }) } as unknown as ComponentProps<typeof CommandForm>, createElement("fieldset")),
    );
    expect(html).toMatch(/<form[^>]*class="record-form"/);
    expect(html).not.toMatch(/<form[^>]*class="form-grid"/);
  });

  it("requires a real assignee instead of offering Unassigned", () => {
    const html = renderToStaticMarkup(
      createElement(AssigneeField, { members: [{ user_id: "11111111-1111-4111-8111-111111111111", display_name: "Jhade" }] }),
    );
    expect(html).toContain("required");
    expect(html).not.toContain("Unassigned");
    expect(html).toContain("Jhade");
  });
});
