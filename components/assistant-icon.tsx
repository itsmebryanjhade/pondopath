/** PondoPath assistant mark: a chat bubble with a small spark inside. Same line style as the dashboard icons. */
export function AssistantIcon({ size = 18 }: { size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="assistant-icon">
      <path d="M6 4.5h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-5.2L8 21v-3.5H6a3 3 0 0 1-3-3v-7a3 3 0 0 1 3-3Z" />
      <path className="assistant-icon-spark" fill="currentColor" stroke="none"
        d="M12 7.6c.3 1.5 1.1 2.3 2.6 2.6-1.5.3-2.3 1.1-2.6 2.6-.3-1.5-1.1-2.3-2.6-2.6 1.5-.3 2.3-1.1 2.6-2.6Z" />
      <circle cx="16.4" cy="13.3" r=".9" fill="currentColor" stroke="none" />
    </svg>
  );
}
