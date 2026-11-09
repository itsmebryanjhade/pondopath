import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImportSelector } from "@/components/import-selector";

describe("column selector wording", () => {
  it("asks in plain words, without row-ID or date-format jargon", () => {
    const markup = renderToStaticMarkup(createElement(ImportSelector, {
      headers: ["Ref", "Amount"], rows: [["A-1", "100"]], labels: [{ row: 2, externalId: "A-1", label: "invoice", reason: "" }],
      fields: { externalId: "Ref", amount: "Amount" }, customers: [],
    }));
    const labels = [...markup.matchAll(/<span>([^<]+)<\/span>/g)].map((match) => match[1]).join(" | ");
    expect(labels).not.toMatch(/row ID|YYYY/i);
    expect(labels).toContain("Which column names each row?");
    expect(labels).toContain("Due date");
  });
});
