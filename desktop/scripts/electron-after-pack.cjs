/**
 * Ad-hoc sign only for unsigned local builds. Skip when Apple CSC_* env is set.
 */
const { execSync } = require("node:child_process");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  if (process.env.CSC_LINK || process.env.CSC_LINK_LOCAL_FILE) return;

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${context.appOutDir}/${appName}.app`;

  try {
    execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: "inherit" });
    console.log("Ad-hoc signed:", appPath);
  } catch (err) {
    console.warn("Ad-hoc codesign skipped:", err.message);
  }
};
