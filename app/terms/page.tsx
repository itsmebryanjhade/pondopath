import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Terms | PondoPath by SoloForge", description: "The terms for using PondoPath during its pilot period." };

export default function Terms() {
  return (
    <LegalPage title="Terms" updated="7 November 2026">
      <p>These terms cover your use of PondoPath, a cash-flow planner run by SoloForge. By creating a workspace or signing in, you agree to them.</p>

      <h2>The pilot</h2>
      <p>PondoPath is in a pilot period and is free during it. Features may change, and the service may be interrupted. If we start charging, we will tell you first and you can choose not to continue.</p>

      <h2>What PondoPath is, and is not</h2>
      <p>PondoPath helps you see cash timing and follow up on payments. It is not accounting, tax, legal or payment software, and it is not financial advice. Forecasts are estimates built from the records you provide, so they are only as good as those records. A customer&rsquo;s promise to pay is not money received.</p>

      <h2>You stay in charge</h2>
      <p>AI suggestions and imported rows are proposals. Nothing changes your saved records until a person confirms it. You are responsible for checking what you confirm and for the decisions you make using PondoPath. PondoPath does not send messages to your customers. You copy drafts and send them yourself.</p>

      <h2>Your account and workspace</h2>
      <ul>
        <li>Each account has one private business. The owner can invite finance teammates and is responsible for who has access.</li>
        <li>Keep your sign-in details to yourself and tell us if you think someone else has used them.</li>
        <li>Only add records you are allowed to use.</li>
      </ul>

      <h2>Your data</h2>
      <p>Your records stay yours. You give us permission to store and process them only to run PondoPath for you, as described in our <a href="/privacy">Privacy</a> page.</p>

      <h2>Acceptable use</h2>
      <p>Do not try to break, overload or get around the security of PondoPath, access another workspace, or use it for anything unlawful.</p>

      <h2>Stopping</h2>
      <p>You can stop using PondoPath at any time and ask us to delete your data. We may suspend access if these terms are broken or to protect the service.</p>

      <h2>No warranty and limits on liability</h2>
      <p>During the pilot, PondoPath is provided &ldquo;as is&rdquo;, without promises that it will be error-free or always available. To the extent the law allows, SoloForge is not liable for indirect losses or for decisions made using the forecasts.</p>

      <h2>Law and changes</h2>
      <p>These terms are governed by the laws of the Philippines. If we change them in a way that matters, we will update the date above and tell you in PondoPath.</p>
    </LegalPage>
  );
}
