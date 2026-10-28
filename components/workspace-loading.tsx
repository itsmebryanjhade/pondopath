export default function WorkspaceLoading() {
  return (
    <section className="workspace-content-loading" aria-busy="true">
      <h1>Opening your cash workspace</h1>
      <p role="status">Loading the latest records…</p>
      <div className="loading-bars" aria-hidden="true">
        <div />
        <div />
        <div />
      </div>
    </section>
  );
}
