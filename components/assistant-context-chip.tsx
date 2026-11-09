export function AssistantContextChip({ label, onClear, disabled }: {
  label: string;
  onClear: () => void;
  disabled: boolean;
}) {
  return (
    <div className="assistant-context" role="group" aria-label="This question is about">
      <span className="assistant-context-about">About</span>
      <strong className="assistant-context-label" title={label}>{label}</strong>
      <button type="button" className="assistant-context-clear" aria-label={"Remove context: " + label}
        title="Clear context and start a new chat" disabled={disabled} onClick={onClear}>×</button>
    </div>
  );
}
