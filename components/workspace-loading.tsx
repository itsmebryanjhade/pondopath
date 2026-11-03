import Image from "next/image";

export default function WorkspaceLoading() {
  return (
    <section className="workspace-content-loading" aria-busy="true">
      <span className="sr-only" role="status">Loading the latest records…</span>
      <div className="workspace-slow-splash" aria-hidden="true"><SplashScene /></div>
      <div className="skeleton-heading" aria-hidden="true">
        <span className="skeleton-line skeleton-eyebrow" />
        <span className="skeleton-line skeleton-title" />
        <span className="skeleton-line skeleton-subtitle" />
      </div>
      <div className="skeleton-feature" aria-hidden="true">
        <div className="skeleton-feature-summary">
          <span className="skeleton-line skeleton-eyebrow" />
          <span className="skeleton-line skeleton-value" />
          <span className="skeleton-line skeleton-subtitle" />
          <span className="skeleton-line skeleton-action" />
        </div>
        <div className="skeleton-feature-chart">
          <span className="skeleton-line skeleton-chart-title" />
          <span className="skeleton-line skeleton-chart" />
        </div>
      </div>
      <div className="skeleton-metrics" aria-hidden="true">
        <div className="skeleton-metric"><span className="skeleton-line skeleton-eyebrow" /><span className="skeleton-line skeleton-metric-value" /></div>
        <div className="skeleton-metric"><span className="skeleton-line skeleton-eyebrow" /><span className="skeleton-line skeleton-metric-value" /></div>
        <div className="skeleton-metric"><span className="skeleton-line skeleton-eyebrow" /><span className="skeleton-line skeleton-metric-value" /></div>
      </div>
      <div className="skeleton-list" aria-hidden="true">
        <span className="skeleton-line skeleton-chart-title" />
        <span className="skeleton-line skeleton-row" />
        <span className="skeleton-line skeleton-row" />
      </div>
    </section>
  );
}

export function WorkspaceSplash() {
  return (
    <main className="workspace-splash" aria-busy="true">
      <SplashScene />
    </main>
  );
}

function SplashScene() {
  return <div className="workspace-splash-scene" role="status" aria-label="Preparing your cash plan">
    <div className="workspace-splash-mark" aria-hidden="true"><Image src="/brand/pondopath-monogram.png" alt="" width={144} height={144} loading="eager" /></div>
    <p className="workspace-splash-name">PondoPath</p>
    <p className="workspace-splash-slow">Still loading your workspace…</p>
  </div>;
}
