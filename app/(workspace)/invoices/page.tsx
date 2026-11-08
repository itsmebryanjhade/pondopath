import { getWorkspace } from "@/lib/server/workspace";
import { CustomerInvoices } from "@/components/customer-invoices";

type InvoicePageProps = { searchParams: Promise<{ page?: string | string[]; filter?: string | string[] }> };

// Adding invoices and customers happens on Add records; this page lists and follows them up.
export default async function Invoices({ searchParams }: InvoicePageProps) {
  const workspace = await getWorkspace();
  const params = await searchParams;
  return <CustomerInvoices workspace={workspace} params={params} />;
}
