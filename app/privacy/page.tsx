import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = { title: "Privacy | PondoPath by SoloForge", description: "What PondoPath collects, why, and the choices you have." };

export default function Privacy() {
  return (
    <LegalPage title="Privacy" updated="7 November 2026">
      <p>PondoPath is a cash-flow planner run by SoloForge. This page explains what it collects, why, and what you can do about it. PondoPath is in a pilot period, so please start with records you are comfortable testing with.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Your account:</strong> your name, email address and role (owner or finance teammate).</li>
        <li><strong>Your business records:</strong> the invoices, expenses, customers, payments and cash balances you enter or import, plus a history of who changed what and when.</li>
        <li><strong>Text you paste:</strong> customer replies you paste into PondoPath so it can suggest a date or amount update.</li>
        <li><strong>If you connect Google:</strong> the email address of the Google account, and read-only access to the files you choose in Google&rsquo;s file picker. We see only those files. We never change or delete them.</li>
      </ul>

      <h2>How we use it</h2>
      <p>Only to run PondoPath for you: to calculate your forecast, show your records, create proposals for you to review, and keep an audit history. We do not sell your data and we do not show ads.</p>

      <h2>AI</h2>
      <p>PondoPath uses an AI service to explain forecast results and to suggest updates from replies you paste. Only the text needed for that request is sent. Calculations are done by programmed rules, not by AI. AI cannot save payments, change records or send messages. Every suggestion waits for your confirmation. Avoid pasting information you do not need to.</p>

      <h2>Google access</h2>
      <p>If you connect Google, PondoPath asks for the narrowest access that works: your email address and access to the files you pick. The sign-in token that lets PondoPath keep reading those files is stored encrypted. Disconnecting in PondoPath stops syncing and deletes the stored token. You can also remove access at any time at <a href="https://myaccount.google.com/permissions" rel="noopener noreferrer">myaccount.google.com/permissions</a>.</p>
      <p>PondoPath&rsquo;s use and transfer of information received from Google APIs adheres to the <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noopener noreferrer">Google API Services User Data Policy</a>, including its Limited Use requirements.</p>

      <h2>Who else handles your data</h2>
      <p>We use service providers to run PondoPath: Supabase (database and sign-in), Vercel (hosting), Google (only if you connect it) and an AI provider (for the AI features above). They process data on our behalf to provide those services.</p>

      <h2>Security</h2>
      <p>Each workspace is private and protected by role-based access. We take care to protect your data, but no online service can promise perfect security.</p>

      <h2>Your choices</h2>
      <p>You can ask us to give you a copy of your data, correct it, or delete it, by emailing the address below. These are also your rights under the Philippine Data Privacy Act of 2012 (Republic Act 10173). You can disconnect Google at any time.</p>

      <h2>Changes</h2>
      <p>If we change this page in a way that matters, we will update the date above and tell you in PondoPath.</p>
    </LegalPage>
  );
}
