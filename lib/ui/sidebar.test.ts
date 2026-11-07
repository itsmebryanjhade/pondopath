import { describe, expect, it } from "vitest";
import { activeHref, badgeText, countPhrase, parseCollapsed, sidebarGroups } from "./sidebar";

describe("sidebar", () => {
  it("groups real workspace pages under Plan, Money and To do", () => {
    const groups = sidebarGroups({ inbox: 0, followups: 0 });
    expect(groups.map((group) => group.title)).toEqual(["Plan", "Money", "To do"]);
    expect(groups.map((group) => group.items.map((item) => item.href))).toEqual([
      ["/overview", "/forecast"], ["/cash", "/invoices", "/expenses"], ["/imports", "/followups"],
    ]);
    expect(groups.flatMap((group) => group.items.map((item) => item.label))).toEqual(["Overview", "Forecast", "Cash", "Invoices", "Expenses", "Review Inbox", "Follow-ups"]);
  });
  it("gives every item its own icon so a collapsed rail is not a guessing game", () => {
    const icons = sidebarGroups({ inbox: 0, followups: 0 }).flatMap((group) => group.items.map((item) => item.icon));
    expect(new Set(icons).size).toBe(icons.length);
  });
  it("shows counts only where something is waiting, with a full-phrase label", () => {
    const items = sidebarGroups({ inbox: 3, followups: 2 }).flatMap((group) => group.items);
    expect(items.find((item) => item.href === "/imports")).toMatchObject({ count: "3", countLabel: "3 waiting for review" });
    expect(items.find((item) => item.href === "/followups")).toMatchObject({ count: "2", countLabel: "2 open follow-ups" });
    const none = sidebarGroups({ inbox: 0, followups: 0 }).flatMap((group) => group.items);
    expect(none.some((item) => item.count)).toBe(false);
  });
  it("badgeText caps large counts and hides zero", () => {
    expect(badgeText(0)).toBe("");
    expect(badgeText(7)).toBe("7");
    expect(badgeText(20)).toBe("20+");
    expect(badgeText(35)).toBe("20+");
  });
  it("countPhrase reads naturally in the singular and plural", () => {
    expect(countPhrase("/imports", 1)).toBe("1 waiting for review");
    expect(countPhrase("/imports", 20)).toBe("20 or more waiting for review");
    expect(countPhrase("/followups", 1)).toBe("1 open follow-up");
    expect(countPhrase("/followups", 4)).toBe("4 open follow-ups");
  });
  it("activeHref highlights each page's own item, and payments under Cash", () => {
    expect(activeHref("/overview")).toBe("/overview");
    expect(activeHref("/payments")).toBe("/cash");
    expect(activeHref("/imports")).toBe("/imports");
    expect(activeHref("/followups")).toBe("/followups");
    expect(activeHref("/add")).toBe("/add");
    expect(activeHref("/invoices/demo-id")).toBe("/invoices");
    expect(activeHref("/invoices-other")).toBe("");
    expect(activeHref("/team")).toBe("");
  });
  it("parseCollapsed only treats a stored 1 as collapsed", () => {
    expect(parseCollapsed("1")).toBe(true);
    expect(parseCollapsed("0")).toBe(false);
    expect(parseCollapsed(null)).toBe(false);
    expect(parseCollapsed("true")).toBe(false);
  });
});
