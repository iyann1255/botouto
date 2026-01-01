require("dotenv").config();

function must(name) {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`ENV ${name} belum diisi.`);
  return String(v).trim();
}

function num(name, defVal) {
  const v = process.env[name];
  if (!v) return defVal;
  const n = Number(v);
  return Number.isFinite(n) ? n : defVal;
}

function parseAdminIds(s) {
  return String(s || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => Number(x))
    .filter((x) => Number.isFinite(x));
}

const CFG = {
  BOT_TOKEN: must("BOT_TOKEN"),
  MONGO_URI: must("MONGO_URI"),
  ADMIN_IDS: parseAdminIds(must("ADMIN_IDS")),
  CHANNEL_ID: must("CHANNEL_ID"),
  SERVER_BASE_URL: must("SERVER_BASE_URL"),

  PAKASIR_PROJECT_SLUG: process.env.PAKASIR_PROJECT_SLUG?.trim() || "",
  PAKASIR_API_KEY: process.env.PAKASIR_API_KEY?.trim() || "",

  ORDERKUOTA_AUTH_USERNAME: process.env.ORDERKUOTA_AUTH_USERNAME?.trim() || "",
  ORDERKUOTA_AUTH_TOKEN: process.env.ORDERKUOTA_AUTH_TOKEN?.trim() || "",

  QIOSPAY_MERCHANT_CODE: process.env.QIOSPAY_MERCHANT_CODE?.trim() || "",
  QIOSPAY_API_KEY: process.env.QIOSPAY_API_KEY?.trim() || "",
  QIOSPAY_QR_STATIC: process.env.QIOSPAY_QR_STATIC?.trim() || "",

  PTERO_PANEL_URL: process.env.PTERO_PANEL_URL?.trim() || "",
  PTERO_APP_API_KEY: process.env.PTERO_APP_API_KEY?.trim() || "",
  PTERO_NEST_ID: Number(process.env.PTERO_NEST_ID || "1"),
  PTERO_EGG_ID_PANEL: Number(process.env.PTERO_EGG_ID_PANEL || "1"),
  PTERO_LOCATION_ID: Number(process.env.PTERO_LOCATION_ID || "1"),

  QRIS_FEE_PERCENTAGE: num("QRIS_FEE_PERCENTAGE", 0.8),
  REVIEW_PENDING_MINUTES: num("REVIEW_PENDING_MINUTES", 30),
  INVOICE_BANNER_PATH: process.env.INVOICE_BANNER_PATH?.trim() || "assets/banner.png",

  PORT: num("PORT", 3000)
};

module.exports = { CFG };
