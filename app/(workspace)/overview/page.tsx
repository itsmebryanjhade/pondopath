import { headers } from "next/headers";
import { getWorkspace } from "@/lib/server/workspace";
import { LOGIN_NOTICE_HEADER } from "@/lib/auth-notice";
import { AuthToast } from "@/components/auth-toast";
import { CashOverview } from "@/components/cash-overview";

// The payment scenario lives on Forecast (and each invoice page); opening cash lives on Cash ledger.
export default async function Overview() {
  const workspace = await getWorkspace();
  const showLoginToast = (await headers()).get(LOGIN_NOTICE_HEADER) === "signed-in";
  return <>
    {showLoginToast && <AuthToast kind="success" message="You’re signed in. Your business cash plan is ready." />}
    <CashOverview workspace={workspace} />
  </>;
}
