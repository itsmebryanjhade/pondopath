import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dismissToast, pushToast, toastIcon, type Toast } from "./toasts";
import { ToastHost } from "@/components/toast-host";

describe("toasts", () => {
  it("pushToast appends and keeps the newest three", () => {
    let list: Toast[] = [];
    for (let id = 1; id <= 4; id++) list = pushToast(list, { message: `Toast ${id}` }, id);
    expect(list.map(toast => toast.id)).toEqual([2, 3, 4]);
    expect(list[2]).toEqual({ id: 4, message: "Toast 4" });
  });
  it("keeps an optional action", () => {
    expect(pushToast([], { message: "15 rows ready to review", action: { label: "Review", href: "/imports" } }, 1)[0].action).toEqual({ label: "Review", href: "/imports" });
  });
  it("dismissToast removes one by id", () => {
    const list = pushToast(pushToast([], { message: "a" }, 1), { message: "b" }, 2);
    expect(dismissToast(list, 1)).toEqual([{ id: 2, message: "b" }]);
    expect(dismissToast(list, 9)).toHaveLength(2);
  });
  it("the host renders its children and one polite status region", () => {
    const html = renderToStaticMarkup(createElement(ToastHost, null, createElement("p", null, "page")));
    expect(html).toContain("<p>page</p>");
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain('aria-live="polite"');
  });
  it("uses a check only for successes, so a refusal never looks like success", () => {
    expect(toastIcon(undefined)).toBe("✓");
    expect(toastIcon("success")).toBe("✓");
    expect(toastIcon("notice")).toBe("!");
    expect(pushToast([], { message: "Only Excel (.xlsx) and CSV files.", tone: "notice" }, 1)[0].tone).toBe("notice");
  });
  it("replaces a toast with the same key instead of stacking it, and leaves other toasts alone", () => {
    let list = pushToast([], { message: "Saved" }, 1);
    list = pushToast(list, { message: "Records refreshed · 4:18 PM", key: "refresh" }, 2);
    list = pushToast(list, { message: "Records refreshed · 4:19 PM", key: "refresh" }, 3);
    expect(list.map((toast) => toast.message)).toEqual(["Saved", "Records refreshed · 4:19 PM"]);
  });
});
