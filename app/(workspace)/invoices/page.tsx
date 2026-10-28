import { getWorkspace } from "@/lib/server/workspace";
import { CustomerInvoices } from "@/components/customer-invoices";
import { CustomerForm, InvoiceForm } from "@/components/record-forms";

type InvoicePageProps = { searchParams: Promise<{ page?: string | string[]; filter?: string | string[] }> };

export default async function Invoices({ searchParams }: InvoicePageProps) {
  const workspace = await getWorkspace();
  const params = await searchParams;
  return <CustomerInvoices workspace={workspace} params={params}
    invoiceControls={<InvoiceForm workspace={workspace} />}
    customerControls={<CustomerForm workspace={workspace} />} />;
}
