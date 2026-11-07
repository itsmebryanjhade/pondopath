import { redirect } from "next/navigation";

// Payment history now lives on the Cash ledger; old links and bookmarks land on that section.
export default function PaymentsPage() {
  redirect("/cash#payment-history");
}
