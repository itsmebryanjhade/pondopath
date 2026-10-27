import type { NextRequest, NextResponse } from "next/server";

export const LOGIN_NOTICE_COOKIE = "pondopath-login-notice";
export const LOGIN_NOTICE_HEADER = "x-pondopath-login-notice";

export function prepareLoginNotice(request: NextRequest) {
  // Next merges response cookies into server reads, so forward before expiring it.
  request.headers.set(LOGIN_NOTICE_HEADER,
    request.cookies.get(LOGIN_NOTICE_COOKIE)?.value === "signed-in" ? "signed-in" : "");
}

export function consumeLoginNotice(request: NextRequest, response: NextResponse) {
  if (request.method === "GET" && request.nextUrl.pathname === "/overview" &&
      request.cookies.get(LOGIN_NOTICE_COOKIE)?.value === "signed-in" &&
      !request.headers.has("next-router-prefetch") && request.headers.get("purpose") !== "prefetch") {
    response.cookies.delete(LOGIN_NOTICE_COOKIE);
  }
}
