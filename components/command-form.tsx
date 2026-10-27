"use client";

import {
  useId,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { useRouter } from "next/navigation";
import { executeWorkspaceAction } from "@/app/(workspace)/actions";
import {
  workspaceCommandSchema,
  type WorkspaceCommand,
  type ActionResult,
  type CommandResult,
} from "@/lib/domain/commands";

type Failure = Extract<ActionResult<CommandResult>, { ok: false }>;

export function TextAreaField({
  label,
  ...input
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  const id = useId();
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <textarea {...input} id={id} className="field" rows={input.rows ?? 3} />
    </div>
  );
}

export function AssigneeField({
  members,
  defaultValue,
}: {
  members: { user_id: string; display_name: string }[];
  defaultValue: string;
}) {
  return (
    <label className="form-field">
      <span>Assigned to</span>
      <select className="field" name="assigneeId" defaultValue={defaultValue} required>
        {members.map((member) => (
          <option key={member.user_id} value={member.user_id}>
            {member.display_name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Field({
  label,
  help,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string; help?: string }) {
  const id = useId();
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input
        {...input}
        id={id}
        aria-describedby={help ? `${id}-help` : undefined}
        className="field"
      />
      {help && <small id={`${id}-help`}>{help}</small>}
    </div>
  );
}

export function CommandForm({
  revision,
  build,
  children,
  label = "Save changes",
}: {
  revision: number;
  build: (data: FormData) => { type: WorkspaceCommand["type"]; payload: object };
  children: ReactNode;
  label?: string;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef<WorkspaceCommand | null>(null);
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [failedRevision, setFailedRevision] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const uncertain = failure?.code === "SERVICE_UNAVAILABLE";
  const conflict = failure?.code === "STALE_VERSION";

  function submit() {
    if (pending || conflict) return;
    let command = submitted.current;
    if (!command) {
      try {
        const draft = build(new FormData(form.current!));
        const parsed = workspaceCommandSchema.safeParse({
          ...draft,
          requestId: crypto.randomUUID(),
          expectedRevision: revision,
        });
        if (!parsed.success)
          throw new RangeError(parsed.error.issues.map((issue) => issue.message).join(" "));
        command = parsed.data;
        submitted.current = command;
      } catch (error) {
        setFailure({
          ok: false,
          code: "VALIDATION_ERROR",
          message:
            error instanceof RangeError ? error.message : "Check your entries and try again.",
        });
        return;
      }
    }
    const original = command;
    setNotice("");
    startTransition(async () => {
      let result: ActionResult<CommandResult>;
      try {
        result = await executeWorkspaceAction(original);
      } catch {
        result = {
          ok: false,
          code: "SERVICE_UNAVAILABLE",
          message: "The save could not be confirmed. Retry the original request before editing.",
        };
      }
      if (result.ok) {
        submitted.current = null;
        setFailure(null);
        setNotice(
          result.data.replayed
            ? "The original save is confirmed. No duplicate was added."
            : "Saved. The cash plan has been refreshed.",
        );
        form.current?.reset();
        router.refresh();
      } else {
        setFailure(result);
        if (result.code !== "SERVICE_UNAVAILABLE") submitted.current = null;
        if (result.code === "STALE_VERSION") {
          setFailedRevision(original.expectedRevision);
          router.refresh();
        }
      }
    });
  }

  return (
    <form
      ref={form}
      className="record-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <fieldset disabled={pending || uncertain}>{children}</fieldset>
      {failure && (
        <div role="alert" className="form-feedback error-feedback">
          <p>{failure.message}</p>
          {failure.fieldErrors && (
            <ul>
              {Object.entries(failure.fieldErrors).map(([key, value]) => (
                <li key={key}>{value}</li>
              ))}
            </ul>
          )}
          {uncertain && <p>Your original entries are held until their save is confirmed.</p>}
          {conflict && (
            <>
              <p>
                Latest records are shown around this form. Your entries are preserved; compare them
                before saving again.
              </p>
              <button
                type="button"
                className="button secondary"
                disabled={revision === failedRevision}
                onClick={() => {
                  submitted.current = null;
                  setFailure(null);
                }}
              >
                I reviewed the latest records
              </button>
            </>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="form-feedback">
          {notice}
        </p>
      )}
      <button
        className="button"
        type={uncertain ? "button" : "submit"}
        onClick={uncertain ? submit : undefined}
        disabled={pending || conflict}
      >
        {pending ? "Confirming save…" : uncertain ? "Retry original request" : label}
      </button>
    </form>
  );
}
