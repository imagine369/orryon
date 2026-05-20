/**
 * Ad-hoc sign the .app bundle so macOS Gatekeeper is less aggressive.
 * Users still need Right-click → Open or `xattr -cr` after browser download.
 */
const { execSync } = require("node:child_process");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${context.appOutDir}/${appName}.app`;

  try {
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: "inherit" });
    console.log("Ad-hoc signed:", appPath);
  } catch (err) {
    console.warn("Ad-hoc codesign skipped:", err.message);
  }
};
