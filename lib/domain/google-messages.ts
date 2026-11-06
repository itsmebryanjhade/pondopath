/** Owner-facing wording for Google and connector error codes. Shared by server actions and the Imports screen. */
const MESSAGES: Record<string, string> = {
  GOOGLE_RECONNECT: "Google needs you to sign in again. Click Reconnect Google.",
  FILE_ACCESS_LOST: "PondoPath can't open this file anymore. Check that it still exists in your Drive.",
  FILE_TOO_LARGE: "This file is too large. Use an Excel or CSV file up to 512 KiB and 100 rows, or a Google Sheet up to 500 rows.",
  FILE_NOT_SUPPORTED: "Choose a Google Sheet, an Excel (.xlsx) file or a CSV file.",
  FILE_UNREADABLE: "PondoPath couldn't read this file. Put the column headers in row 1 and use plain values.",
  GOOGLE_UNAVAILABLE: "Google didn't respond. Try again in a moment.",
  GOOGLE_NOT_CONFIGURED: "Connect Google isn't set up on this server yet.",
  DUPLICATE_REFERENCE: "This file is already connected.",
  LIMIT_REACHED: "This workspace has reached its limit of 20 sources.",
  FORBIDDEN: "Only the owner can do this.",
  INVALID_SHEET: "The file has more than 500 rows, more than 24 columns or repeated column names.",
  INVALID_MAPPING: "The saved setup no longer fits this file. Open the setup and save it again.",
  MAPPING_HEADER_MISSING: "A column used in the setup was renamed or removed. Open the setup and choose it again.",
  CONNECTED_OWNER_REMOVED: "The owner who connected this file is no longer an owner. An owner needs to set it up again.",
};
export function googleMessage(code: string): string {
  return MESSAGES[code] ?? "That didn't work. Refresh the page and try again.";
}
