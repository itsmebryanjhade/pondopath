import Link from "next/link";

export default function RecordNotFound() {
  return (
    <main className="loading-workspace">
      <h1>Record unavailable</h1>
      <p>This record could not be found in your business workspace.</p>
      <Link className="button secondary" href="/invoices">
        Back to customer invoices
      </Link>
    </main>
  );
}
