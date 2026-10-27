import { ProductBrand } from "@/components/product-brand";

export default function WorkspaceLoading() {
  return (
    <main className="loading-workspace" aria-busy="true">
      <ProductBrand />
      <h1>Cash plan</h1>
      <p role="status">Loading the latest records…</p>
      <div className="loading-bars" aria-hidden="true">
        <div />
        <div />
        <div />
      </div>
    </main>
  );
}
