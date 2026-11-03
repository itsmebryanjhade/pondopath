import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

const hooks = vi.hoisted(() => ({ refs: [] as { current: unknown }[], cursor: 0, pending: [] as Promise<void>[] }));
const execute = vi.hoisted(() => vi.fn());
vi.mock("@/app/(workspace)/actions", () => ({ executeWorkspaceAction: execute }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useRef: (value: unknown) => hooks.refs[hooks.cursor++] ??= { current: value },
  useState: (value: unknown) => [value, vi.fn()],
  useTransition: () => [false, (callback: () => Promise<void>) => hooks.pending.push(callback())],
}));
import { CommandForm } from "../../components/command-form";

beforeEach(() => {
  hooks.refs = []; hooks.cursor = 0; hooks.pending = [];
  execute.mockReset().mockResolvedValue({ ok: false, code: "STALE_VERSION", message: "Refresh and review." });
  vi.stubGlobal("FormData", class extends FormData { constructor() { super(); } });
});
afterEach(() => vi.unstubAllGlobals());

it("keeps a dirty draft's revision after surrounding records refresh", async () => {
  const build = () => ({ type: "save_customer" as const, payload: { name: "Older draft", contactName: "Test contact" } });
  type FormProps = { onChangeCapture?: () => void; onSubmit: (event: { preventDefault(): void }) => void };
  function render(revision: number) {
    hooks.cursor = 0;
    return CommandForm({ revision, build, children: null }) as ReactElement<FormProps>;
  }
  const initial = render(4);
  initial.props.onChangeCapture?.();
  const refreshed = render(5);
  refreshed.props.onSubmit({ preventDefault() {} });
  await Promise.all(hooks.pending);
  expect(execute.mock.calls[0][0].expectedRevision).toBe(4);
  expect(execute.mock.calls[0][0].payload.name).toBe("Older draft");
});
