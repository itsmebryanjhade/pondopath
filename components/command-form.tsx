"use client";

import {
  useId,
  useRef,
  useState,
  useEffect,
  useTransition,
  type ReactNode,
  type ComponentProps,
  type TextareaHTMLAttributes,
  createContext,
} from "react";
import { useRouter } from "next/navigation";
import { executeWorkspaceAction } from "@/app/(workspace)/actions";
import {
  workspaceCommandSchema,
  type WorkspaceCommand,
  type ActionResult,
  type CommandResult,
} from "@/lib/domain/commands";
import { expandAmountShorthand, quickDateChoices } from "@/lib/domain/manual-entry";
import type { LocalDate } from "@/lib/domain/types";

type Failure = Extract<ActionResult<CommandResult>, { ok: false }>;

/** A control inside a form saved a change of its own (e.g. a new customer): revision `from` became `to`. */
export type OwnChange = { from: number; to: number };
/** Lets a control inside a CommandForm report its own save, so the draft isn't treated as stale because of it. */
export const OwnChangeContext = createContext<(change: OwnChange) => void>(() => {});

export function TextAreaField({
  label,
  help,
  ...input
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; help?: string }) {
  const id = useId();
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <textarea
        {...input}
        id={id}
        aria-describedby={help ? `${id}-help` : undefined}
        className="field"
      />
      {help && <small id={`${id}-help`}>{help}</small>}
    </div>
  );
}

export function AssigneeField({
  members,
  defaultValue,
}: {
  members: Array<{ user_id: string; display_name: string }>;
  defaultValue?: string;
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
}: ComponentProps<"input"> & { label: string; help?: string }) {
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

export function AmountField({
  label,
  help = "Use k or m for shorthand (e.g. 15k, 1.5m). No commas or ₱ sign.",
  ...input
}: ComponentProps<"input"> & { label: string; help?: string }) {
  const id = useId();
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input
        {...input}
        id={id}
        inputMode="decimal"
        aria-describedby={help ? `${id}-help` : undefined}
        className="field"
        onBlur={(e) => {
          const val = e.target.value;
          if (val) {
            const expanded = expandAmountShorthand(val);
            if (expanded !== val) {
              e.target.value = expanded;
            }
          }
          input.onBlur?.(e);
        }}
      />
      {help && <small id={`${id}-help`}>{help}</small>}
    </div>
  );
}

export function DueDateField({
  label = "Original due date",
  name = "dueDate",
  referenceDate,
  defaultValue,
  value: controlledValue,
  onChange: onControlledChange,
  required = true,
  help,
}: {
  label?: string;
  name?: string;
  referenceDate: LocalDate;
  defaultValue?: string;
  value?: string;
  onChange?: (date: string) => void;
  required?: boolean;
  help?: string;
}) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const initialDate = defaultValue ?? referenceDate;
  const [internalDate, setInternalDate] = useState(initialDate);
  const activeDate = controlledValue !== undefined ? controlledValue : internalDate;
  const setDate = (d: string) => {
    if (controlledValue === undefined) setInternalDate(d);
    onControlledChange?.(d);
  };

  useEffect(() => {
    const formEl = inputRef.current?.form;
    if (!formEl) return;
    const handleReset = () => {
      setInternalDate(initialDate);
    };
    formEl.addEventListener("reset", handleReset);
    return () => formEl.removeEventListener("reset", handleReset);
  }, [initialDate]);

  const choices = quickDateChoices(referenceDate);

  return (
    <div className="form-field">
      <label htmlFor={id}>{label}</label>
      <input
        ref={inputRef}
        type="date"
        name={name}
        id={id}
        value={activeDate}
        onChange={(e) => setDate(e.target.value)}
        className="field"
        required={required}
        aria-describedby={help ? `${id}-help` : undefined}
      />
      <div className="quick-date-choices" role="group" aria-label="Quick date choices">
        {choices.map((choice) => (
          <button
            key={choice.key}
            type="button"
            className={`quick-date-chip ${activeDate === choice.date ? "is-selected" : ""}`}
            onClick={() => setDate(choice.date)}
          >
            {choice.label}
          </button>
        ))}
      </div>
      {help && <small id={`${id}-help`}>{help}</small>}
    </div>
  );
}

export function CommandForm({
  revision,
  build,
  children,
  label = "Save changes",
  onSaved,
  secondary,
  allowAddAnother = false,
  onAddAnother,
}: {
  revision: number;
  build: (data: FormData) => { type: WorkspaceCommand["type"]; payload: object };
  children: ReactNode;
  label?: string;
  onSaved?: () => void;
  /** An extra control shown beside the save button, such as Cancel. */
  secondary?: ReactNode;
  /** Allow saving and continuing to add another record. */
  allowAddAnother?: boolean;
  /** Called after save and add another succeeds, e.g. to update next number or focus. */
  onAddAnother?: () => void;
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const submitted = useRef<WorkspaceCommand | null>(null);
  const draftRevision = useRef<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [failedRevision, setFailedRevision] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const uncertain = failure?.code === "SERVICE_UNAVAILABLE";

  const ownChange = ({ from, to }: OwnChange) => {
    if (to === from + 1 && (draftRevision.current ?? revision) === from) draftRevision.current = to;
  };
  const conflict = failure?.code === "STALE_VERSION";

  function submit(addAnother = false) {
    if (pending || conflict) return;
    let command = submitted.current;
    if (!command) {
      try {
        const amountInputs = form.current?.querySelectorAll<HTMLInputElement>(
          'input[inputmode="decimal"], input[name="amount"]',
        );
        amountInputs?.forEach((input) => {
          if (input.value) {
            const expanded = expandAmountShorthand(input.value);
            if (expanded !== input.value) input.value = expanded;
          }
        });

        const draft = build(new FormData(form.current!));
        const parsed = workspaceCommandSchema.safeParse({
          ...draft,
          requestId: crypto.randomUUID(),
          expectedRevision: draftRevision.current ?? revision,
        });
        if (!parsed.success) {
          const first = parsed.error.issues[0]?.message || "Check the entered values.";
          setFailure({
            ok: false,
            code: "VALIDATION_ERROR",
            message: first,
          });
          return;
        }
        command = parsed.data;
        submitted.current = command;
      } catch (error) {
        setFailure({
          ok: false,
          code: "VALIDATION_ERROR",
          message: error instanceof Error ? error.message : "Check the entered values.",
        });
        return;
      }
    }
    setNotice("");
    startTransition(async () => {
      const result = await executeWorkspaceAction(command!);
      if (result.ok) {
        submitted.current = null;
        draftRevision.current = null;
        setFailure(null);
        form.current?.reset();
        if (addAnother) {
          setNotice("Saved. Ready for the next one.");
          onAddAnother?.();
        } else {
          setNotice(
            result.data.replayed
              ? "The original save is confirmed. No duplicate was added."
              : "Saved. The cash plan has been refreshed.",
          );
          onSaved?.();
        }
      } else {
        setFailure(result);
        if (result.code !== "SERVICE_UNAVAILABLE") submitted.current = null;
        if (result.code === "STALE_VERSION") {
          setFailedRevision(revision);
          router.refresh();
        }
      }
    });
  }

  return (
    <form
      ref={form}
      className="record-form"
      onChangeCapture={() => {
        draftRevision.current ??= revision;
      }}
      onChange={() => {
        if (conflict && revision !== failedRevision) {
          draftRevision.current = revision;
          setFailure(null);
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        submit(false);
      }}
    >
      <fieldset disabled={pending || uncertain}>
        <OwnChangeContext.Provider value={ownChange}>
          {children}
        </OwnChangeContext.Provider>
      </fieldset>
      {failure && (
        <div role="alert" className="form-feedback error-feedback">
          <p>{failure.message}</p>
          {conflict && (
            <p>
              Someone updated records while you were working. Review the latest values before
              re-saving.
            </p>
          )}
          {uncertain && (
            <p>
              We couldn’t confirm that this change was recorded. Use the retry button to safely check
              without creating a duplicate.
            </p>
          )}
        </div>
      )}
      {notice && (
        <p role="status" className="form-feedback success-feedback">
          {notice}
        </p>
      )}
      <div className={secondary || allowAddAnother ? "form-actions" : undefined}>
        <button
          className="button"
          type={uncertain ? "button" : "submit"}
          onClick={uncertain ? () => submit(false) : undefined}
          disabled={pending || conflict}
        >
          {pending ? "Confirming save…" : uncertain ? "Retry original request" : label}
        </button>
        {allowAddAnother && (
          <button
            className="button secondary"
            type="button"
            onClick={() => submit(true)}
            disabled={pending || conflict}
          >
            Save and add another
          </button>
        )}
        {secondary}
      </div>
    </form>
  );
}
