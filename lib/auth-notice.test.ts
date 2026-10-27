import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { consumeLoginNotice, prepareLoginNotice, LOGIN_NOTICE_COOKIE, LOGIN_NOTICE_HEADER } from "./auth-notice";

describe("one-time sign-in feedback", () => {
  function request(path = "/overview", headers: Record<string, string> = {}, method = "GET") {
    return new NextRequest("http://localhost:3001" + path, { method, headers: { cookie: LOGIN_NOTICE_COOKIE + "=signed-in", ...headers } });
  }

  it("expires the outgoing marker without mutating the incoming request", () => {
    const incoming = request();
    const response = NextResponse.next();
    consumeLoginNotice(incoming, response);
    expect(incoming.cookies.get(LOGIN_NOTICE_COOKIE)?.value).toBe("signed-in");
    expect(response.cookies.get(LOGIN_NOTICE_COOKIE)?.value).toBe("");
    expect(Number(response.cookies.get(LOGIN_NOTICE_COOKIE)?.expires)).toBe(0);
  });

  it("forwards the verified notice separately from response cookie deletion", () => {
    const incoming = request();
    prepareLoginNotice(incoming);
    const response = NextResponse.next({ request: incoming });
    consumeLoginNotice(incoming, response);
    expect(response.headers.get("x-middleware-request-" + LOGIN_NOTICE_HEADER)).toBe("signed-in");
    expect(response.cookies.get(LOGIN_NOTICE_COOKIE)?.value).toBe("");
  });

  it("overwrites a caller-supplied notice header when no sign-in marker exists", () => {
    const incoming = request("/overview", { cookie: "", [LOGIN_NOTICE_HEADER]: "signed-in" });
    prepareLoginNotice(incoming);
    const response = NextResponse.next({ request: incoming });
    expect(response.headers.get("x-middleware-request-" + LOGIN_NOTICE_HEADER)).toBe("");
  });

  it.each([
    ["/login", {}, "GET"],
    ["/overview", { "next-router-prefetch": "1" }, "GET"],
    ["/overview", { purpose: "prefetch" }, "GET"],
    ["/overview", {}, "POST"],
    ["/overview", { cookie: "" }, "GET"],
    ["/overview", { cookie: LOGIN_NOTICE_COOKIE + "=unknown" }, "GET"],
  ] as const)("does not consume feedback before a real overview navigation: %s %j %s", (path, headers, method) => {
    const response = NextResponse.next();
    consumeLoginNotice(request(path, headers, method), response);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
