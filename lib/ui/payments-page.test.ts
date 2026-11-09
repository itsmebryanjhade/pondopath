import { describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({ redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }) }));
vi.mock("next/navigation", () => navigation);
import PaymentsPage from "@/app/(workspace)/payments/page";

describe("Payments page", () => {
  it("sends old links to the payment history on the Cash ledger", () => {
    expect(() => PaymentsPage()).toThrow("NEXT_REDIRECT");
    expect(navigation.redirect).toHaveBeenCalledWith("/cash#payment-history");
  });
});
