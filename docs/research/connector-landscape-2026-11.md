# Connector landscape for easy setup — November 2026

Researched 6 November 2026 by two documentation-research agents and summarized for Bryan. Goal: owners should connect where they already keep invoices, payments and expenses with a familiar sign-in and file picker, not by pasting keys or connection IDs. **V** = seen on an official page; **U** = unverified (third-party, secondary or inferred). This is research, not an implementation decision beyond the scope recorded in [the plan](../../tasks/plan.md).

## Where Philippine businesses keep money records

| Segment | Likely tools | Evidence |
| --- | --- | --- |
| Micro | Paper notebooks; little software | Lista PH survey of 300 microentrepreneurs: 64% track manually, 3% use digital tools such as Excel ([MoneySense, 16 Nov 2021](https://moneysense.com.ph/lista-ph-records-php-75-million-worth-of-debts-paid-in-four-months/)). Weak: vendor release, small sample, old. |
| Small | Excel, Google Sheets, e-wallet dashboards | CPA Australia 2025 survey: 74% of Filipino SMEs earn more than 10% of revenue through digital payments ([The Accountant, 28 May 2025](https://www.theaccountant-online.com/news/filipino-smes-digital-adoption/)). Medium strength; says nothing about spreadsheets. Spreadsheet share is inferred. |
| Medium | Accounting software, POS | Claims of 11–16% software or digital-tool adoption were found in search results but not opened (U). No primary DTI/PSA/World Bank figure was found. |

Inference: file imports (Sheets, xlsx, csv) and e-wallet or marketplace exports reach the largest digital group; accounting APIs reach fewer, larger businesses; paper users need photo capture.

## Spreadsheets and cloud files

- **Google (recommended first).** The `drive.file` scope with the Google Picker is **non-sensitive** and recommended (V, [Sheets API scopes](https://developers.google.com/workspace/sheets/api/scopes)). It limits access to files the user picks or opens with the app (V, [Drive API auth](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)). Non-sensitive apps need **brand verification** only; sensitive scopes add app verification (up to about 10 days); restricted scopes add a security assessment (V, [verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)). In Testing status, refresh tokens expire after 7 days; in Production they stop after 6 months unused or on revocation, with a cap of 100 per account per client (V, [OAuth expiration](https://developers.google.com/identity/protocols/oauth2#expiration)). That a picked Sheet's cells can be read with `spreadsheets.values.get` under `drive.file` is **U**. Test it first; the fallback is a Drive export to CSV, or downloading the .xlsx or .csv.
- **Microsoft (after the hackathon).** OneDrive File Picker v8 is delegated-only (V, [picker](https://learn.microsoft.com/en-us/onedrive/developer/controls/file-pickers/)). No per-file Graph read scope works for both personal and work accounts. `Files.Read` (all user files, no admin consent) is the practical minimum; `Files.Read.Selected` is preview, work-only and not for direct Graph calls (V, [permissions](https://learn.microsoft.com/en-us/onedrive/developer/rest-api/concepts/permissions_reference)). Publisher verification is free and needs a Cloud Partner Program account (V, [overview](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)). Refresh tokens last 90 days by default and 24 hours for SPA redirects, so use a confidential web registration (V, [refresh tokens](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens)).

## Accounting, POS, payments and e-commerce

| System | Sign-in (OAuth) | Cost / review | Status |
| --- | --- | --- | --- |
| Xero | Yes (U) | Free Starter tier for 5 connections; paid tiers from AUD 35/month; certification and security assessment from Core upward (V, [pricing](https://developer.xero.com/pricing), effective 2 March 2026) | After hackathon; read-only scope names unverified |
| QuickBooks Online | Yes (U); PH storefront exists (V, [PH site](https://quickbooks.intuit.com/ph/)) | 2025 App Partner Program fees and app assessment (U; official fee table not found) | After hackathon, once costs are confirmed |
| Loyverse POS | OAuth 2.0 documented (V, [developer portal](https://developer.loyverse.com/docs/)); details need a portal sign-in | Unseen | After hackathon |
| Zoho Books | Yes (V, [Zoho OAuth](https://www.zoho.com/accounts/protocol/oauth.html)); no PH edition (V) | Unverified | Lower priority |
| GCash for Business, Maya Business | No open API found; CSV export from the dashboard (V for GCash, [help](https://help.gcash.com/hc/en-us/articles/48457463083545-How-do-I-review-and-download-my-GCash-for-Business-Transaction-History)) | — | Import presets |
| PayMongo, Xendit | API keys or platform partnership, not user sign-in (U) | Partnership | After hackathon |
| Juan/JuanTax, Taxumo, StoreHub, Utak, Mosaic | No public API found (U) | — | CSV or partnership |
| Shopify, Lazada, Shopee | OAuth-style seller authorization (U); Shopify public apps need review and a registration fee (V, [distribution](https://shopify.dev/docs/apps/launch/distribution)) | Approval rules vary | After hackathon |
| Unified APIs (Apideck, Codat, Merge, Rutter) | One integration for many accounting tools | Apideck from USD 599/month, no free tier (V, [pricing](https://www.apideck.com/pricing)); no PH POS or e-wallet coverage found (U) | Not for the MVP |

## Platform notes

- **Scheduling:** Vercel Hobby cron runs at most once a day, with hourly precision; Pro allows per-minute runs (V, [usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing), 2026-07-15). Supabase Cron (`pg_cron`, with `pg_net` for HTTP calls) supports short intervals (V, [Cron](https://supabase.com/docs/guides/cron)). Free projects pause after one week of inactivity (V, [pricing](https://supabase.com/pricing)), which stops scheduled jobs (inferred). Plan: a Supabase schedule, plus a sync when the inbox opens, plus **Sync now**.
- **Token storage:** Supabase Vault (`vault.create_secret`, the `vault.decrypted_secrets` view, restricted to server-only code) (V, [Vault](https://supabase.com/docs/guides/database/vault)). Free-plan availability and beta status are **U**. The fallback is application-level AES-GCM encryption with a server-only key. `pg_net` briefly stores decrypted request headers in its queue (V, [scheduled functions](https://supabase.com/docs/guides/functions/schedule-functions)), so keep tokens out of scheduled HTTP payloads.

## Gaps to close before building each item

1. Under `drive.file`, confirm that a picked Sheet can be read with `spreadsheets.values.get` (otherwise export it).
2. Confirm Vault is available on this project, or use the app-encrypted fallback.
3. After the hackathon: Xero read-only scope names; Intuit's official fee table; Loyverse scopes and pricing; Shopee/Lazada review rules; PayMongo/Xendit platform terms.
