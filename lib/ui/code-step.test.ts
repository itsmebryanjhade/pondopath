import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CodeStep } from "@/components/code-step";

const render = (props: Partial<Parameters<typeof CodeStep>[0]> = {}) => renderToStaticMarkup(createElement(CodeStep, {
  email: "owner@fictional.example", verify: vi.fn(), resend: vi.fn(), onBack: vi.fn(), ...props,
})).replaceAll("&#x27;", "'");

describe("emailed code step", () => {
  it("shows where the code was sent and a labelled one-time-code field", () => {
    const html = render();
    expect(html).toContain("owner@fictional.example");
    expect(html).toContain('for="code">6-digit code');
    expect(html).toContain('autoComplete="one-time-code"');
    expect(html).toContain('inputMode="numeric"');
    expect(html).toContain('maxLength="6"');
    expect(html).toContain('name="token"');
    expect(html).toContain('type="hidden" name="email" value="owner@fictional.example"');
  });
  it("waits before allowing another code, and offers a way back", () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Resend code in 60s<\/button>/);
    expect(html).toContain("Use a different email");
    expect(render({ cooldown: 0 })).toMatch(/<button[^>]*>Resend code<\/button>/);
    expect(render({ cooldown: 0 })).not.toMatch(/<button[^>]*disabled[^>]*>Resend code<\/button>/);
  });
  it("uses the custom button and back labels", () => {
    const html = render({ submitLabel: "Save password and sign in", backLabel: "Back to sign in" });
    expect(html).toContain("Save password and sign in");
    expect(html).toContain("Back to sign in");
  });
});
