const target = new URL(process.env.APP_URL || "http://localhost:3000");
if (target.protocol !== "https:" && !(target.protocol === "http:" && ["localhost", "127.0.0.1"].includes(target.hostname))) {
  throw new Error("Use HTTPS for a remote app, or localhost for development.");
}
if (!process.env.AUTOMATION_TOKEN || process.env.AUTOMATION_TOKEN.length < 32) throw new Error("Set the server-issued automation token in .env.automation.local.");

module.exports = {
  uiHost: "127.0.0.1",
  uiPort: 1880,
  httpNodeRoot: false,
  functionExternalModules: false,
  externalModules: { autoInstall: false, palette: { allowInstall: false, allowUpload: false }, modules: { allowInstall: false } },
  logging: { console: { level: "info", metrics: false, audit: false } },
};
