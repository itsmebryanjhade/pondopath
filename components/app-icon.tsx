export type AppIconName = "bar-chart-2" | "file-text" | "credit-card" | "users" | "log-out" | "refresh-cw" | "help-circle" | "book-open" | "chevron-down";

export function AppIcon({ name }: { name: AppIconName }) {
  return <span aria-hidden="true" className="app-icon" style={{ maskImage: `url(/icons/${name}.svg)`, WebkitMaskImage: `url(/icons/${name}.svg)` }} />;
}
