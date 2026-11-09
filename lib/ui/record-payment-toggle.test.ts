import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecordPaymentToggle } from "@/components/record-payment-toggle";

describe("Record payment toggle", () => {
  it("starts closed: the button says so and the form below can't be reached until it opens", () => {
    const html = renderToStaticMarkup(createElement(RecordPaymentToggle, null, createElement("form", { "data-form": true })));
    expect(html).toMatch(/<button[^>]*aria-expanded="false"[^>]*>Record payment/);
    expect(html).toMatch(/class="record-payment-panel" data-open="false" inert=""/);
    // The form stays mounted, so a half-filled entry survives closing and reopening.
    expect(html).toContain('data-form="true"');
  });
});
