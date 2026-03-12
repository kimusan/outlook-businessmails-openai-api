const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const certOutputDir = path.join(rootDir, "release", "local-host", "certs");
const keyOutputPath = path.join(certOutputDir, "localhost-key.pem");
const certOutputPath = path.join(certOutputDir, "localhost.pem");
const certForImportPath = path.join(certOutputDir, "localhost.cer");

function configureWritableCertHome() {
  const certHome = path.resolve(
    process.env.OUTLOOK_AI_CERT_HOME || path.join(rootDir, ".local-cert-home")
  );
  const configHome = path.join(certHome, ".config");
  const dataHome = path.join(certHome, ".local", "share");

  fs.mkdirSync(configHome, { recursive: true });
  fs.mkdirSync(dataHome, { recursive: true });

  process.env.HOME = certHome;
  process.env.USERPROFILE = process.env.USERPROFILE || certHome;
  process.env.XDG_CONFIG_HOME = configHome;
  process.env.XDG_DATA_HOME = dataHome;
}

function copyProvidedCertificates() {
  const keySource = process.env.LOCAL_CERT_KEY_PATH;
  const certSource = process.env.LOCAL_CERT_PATH;

  if (!keySource && !certSource) {
    return false;
  }

  if (!keySource || !certSource) {
    throw new Error("Set both LOCAL_CERT_KEY_PATH and LOCAL_CERT_PATH, or neither.");
  }

  const resolvedKeySource = path.resolve(keySource);
  const resolvedCertSource = path.resolve(certSource);

  if (!fs.existsSync(resolvedKeySource)) {
    throw new Error(`LOCAL_CERT_KEY_PATH not found: ${resolvedKeySource}`);
  }

  if (!fs.existsSync(resolvedCertSource)) {
    throw new Error(`LOCAL_CERT_PATH not found: ${resolvedCertSource}`);
  }

  fs.copyFileSync(resolvedKeySource, keyOutputPath);
  fs.copyFileSync(resolvedCertSource, certOutputPath);
  fs.copyFileSync(resolvedCertSource, certForImportPath);

  process.stdout.write("Copied existing HTTPS certificate files into release/local-host/certs.\n");
  return true;
}

async function generateSelfSignedCertificates() {
  configureWritableCertHome();
  const { generateCertificates } = require("office-addin-dev-certs/lib/generate");
  const caOutputPath = path.join(certOutputDir, "dev-ca.crt");

  await generateCertificates(caOutputPath, certOutputPath, keyOutputPath, 825, [
    "localhost",
    "127.0.0.1",
  ]);

  if (!fs.existsSync(certOutputPath) || !fs.existsSync(keyOutputPath)) {
    throw new Error("Certificate generation completed without writing cert/key files.");
  }

  const certContents = fs.readFileSync(certOutputPath, "utf8");
  fs.writeFileSync(certForImportPath, certContents, "utf8");

  process.stdout.write(
    "Generated localhost certificate from office-addin-dev-certs in release/local-host/certs.\n"
  );
}

async function main() {
  fs.mkdirSync(certOutputDir, { recursive: true });

  const copied = copyProvidedCertificates();
  if (!copied) {
    await generateSelfSignedCertificates();
  }

  process.stdout.write(`Key:  ${keyOutputPath}\n`);
  process.stdout.write(`Cert: ${certOutputPath}\n`);
  process.stdout.write(`CA:   ${path.join(certOutputDir, "dev-ca.crt")}\n`);
  process.stdout.write(
    "Important: Import dev-ca.crt into Current User > Trusted Root Certification Authorities on target machines.\n"
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
