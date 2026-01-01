const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const { Telegraf, Markup } = require("telegraf");
const { v4: uuidv4 } = require("uuid");

const { CFG } = require("./config");
const { logger } = require("./logger");
const { connectMongo } = require("./db");

const User = require("./models/User");
const Product = require("./models/Product");
const Transaction = require("./models/Transaction");
const Voucher = require("./models/Voucher");

const { pakasirClient } = require("./services/pakasir");
const { orderkuotaClient } = require("./services/orderkuota");
const { qiospayClient } = require("./services/qiospay");
const { healthReport } = require("./monitor/health");

const bot = new Telegraf(CFG.BOT_TOKEN);

// Optional gateway clients
const pakasir =
  CFG.PAKASIR_PROJECT_SLUG && CFG.PAKASIR_API_KEY
    ? pakasirClient({ slug: CFG.PAKASIR_PROJECT_SLUG, apiKey: CFG.PAKASIR_API_KEY })
    : null;

const orderkuota =
  CFG.ORDERKUOTA_AUTH_USERNAME && CFG.ORDERKUOTA_AUTH_TOKEN
    ? orderkuotaClient({ username: CFG.ORDERKUOTA_AUTH_USERNAME, token: CFG.ORDERKUOTA_AUTH_TOKEN })
    : null;

const qiospay =
  CFG.QIOSPAY_MERCHANT_CODE && CFG.QIOSPAY_API_KEY
    ? qiospayClient({ merchantCode: CFG.QIOSPAY_MERCHANT_CODE, apiKey: CFG.QIOSPAY_API_KEY })
    : null;

// ----------------- Helpers -----------------
function isAdmin(tgId) {
  return CFG.ADMIN_IDS.includes(Number(tgId));
}

function money(n) {
  return "Rp " + Number(n || 0).toLocaleString("id-ID");
}

async function getOrCreateUser(ctx) {
  const tgId = ctx.from?.id;
  const username = ctx.from?.username || "";
  const firstName = ctx.from?.first_name || "";

  let u = await User.findOne({ tgId });
  if (!u) {
    u = await User.create({ tgId, username, firstName, balance: 0 });
  } else {
    if (u.username !== username || u.firstName !== firstName) {
      u.username = username;
      u.firstName = firstName;
      await u.save();
    }
  }
  return u;
}

async function resetState(tgId) {
  await User.updateOne({ tgId }, { $set: { "state.step": "", "state.temp": {} } });
}

async function setState(tgId, step, temp = {}) {
  await User.updateOne({ tgId }, { $set: { "state.step": step, "state.temp": temp } });
}

async function applyVoucher({ tgId, voucherCode, amount }) {
  if (!voucherCode) return { discount: 0, voucher: null, reason: "" };

  const v = await Voucher.findOne({ code: voucherCode.toUpperCase() });
  if (!v || !v.active) return { discount: 0, voucher: null, reason: "Voucher tidak valid / nonaktif." };
  if (amount < v.minAmount) return { discount: 0, voucher: null, reason: `Minimal transaksi ${money(v.minAmount)}.` };

  if (v.usageLimit > 0 && v.usedCount >= v.usageLimit) {
    return { discount: 0, voucher: null, reason: "Voucher sudah mencapai limit penggunaan." };
  }

  const user = await User.findOne({ tgId });
  if (user?.redeemedVouchers?.includes(v.code)) {
    return { discount: 0, voucher: null, reason: "Voucher sudah pernah kamu pakai." };
  }

  let discount = 0;
  if (v.type === "PERCENT") {
    discount = Math.floor((amount * v.value) / 100);
    if (v.maxDiscount > 0) discount = Math.min(discount, v.maxDiscount);
  } else {
    discount = Math.min(amount, v.value);
  }

  return { discount, voucher: v, reason: "" };
}

function mainMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🛒 Order", "MENU_ORDER"), Markup.button.callback("💰 Saldo", "MENU_BALANCE")],
    [Markup.button.callback("🎟️ Voucher", "MENU_VOUCHER"), Markup.button.callback("📦 Produk", "MENU_PRODUCTS")],
    [Markup.button.callback("🧾 Transaksi", "MENU_TRX"), Markup.button.callback("🧑‍💻 Admin", "MENU_ADMIN")]
  ]);
}

async function listProductsText(limit = 50) {
  const items = await Product.find({ active: true }).sort({ category: 1, price: 1 }).limit(limit);
  if (!items.length) return "Belum ada produk aktif.";

  let out = "📦 *Daftar Produk*\n\n";
  for (const p of items) {
    out += `• *${p.name}*\n  - Code: \`${p.code}\`\n  - Harga: *${money(p.price)}*\n  - Kategori: ${p.category}\n\n`;
  }
  out += "Untuk order: klik *Order* lalu pilih produk.";
  return out;
}

async function buildProductKeyboard() {
  const items = await Product.find({ active: true }).sort({ category: 1, price: 1 }).limit(20);
  if (!items.length) return null;

  const rows = items.map((p) => [Markup.button.callback(`${p.name} (${money(p.price)})`, `PICK_${p.code}`)]);
  rows.push([Markup.button.callback("⬅️ Kembali", "BACK_MENU")]);
  return Markup.inlineKeyboard(rows);
}

// ----------------- BOT Commands -----------------
bot.start(async (ctx) => {
  await getOrCreateUser(ctx);
  await resetState(ctx.from.id);

  const msg =
    `Halo ${ctx.from.first_name || "bro"}.\n` +
    `Ini BOT-AUTO. Pilih menu di bawah.\n\n` +
    `Channel: ${CFG.CHANNEL_ID}`;
  await ctx.reply(msg, mainMenu());
});

bot.command("menu", async (ctx) => ctx.reply("Menu:", mainMenu()));

bot.command("saldo", async (ctx) => {
  const u = await getOrCreateUser(ctx);
  await ctx.reply(`Saldo kamu: *${money(u.balance)}*`, { parse_mode: "Markdown" });
});

bot.command("produk", async (ctx) => {
  const text = await listProductsText();
  await ctx.reply(text, { parse_mode: "Markdown" });
});

bot.command("trx", async (ctx) => {
  const tgId = ctx.from.id;
  const items = await Transaction.find({ tgId }).sort({ createdAt: -1 }).limit(10);
  if (!items.length) return ctx.reply("Belum ada transaksi.");

  let out = "🧾 *10 Transaksi Terakhir*\n\n";
  for (const t of items) {
    out += `• \`${t.trxId}\` - *${t.status}*\n  ${t.productName} → ${t.target}\n  ${money(t.amount)}\n\n`;
  }
  await ctx.reply(out, { parse_mode: "Markdown" });
});

// Admin: add saldo
bot.command("addsaldo", async (ctx) => {
  const tgId = ctx.from.id;
  if (!isAdmin(tgId)) return ctx.reply("Kamu bukan admin.");

  const parts = ctx.message.text.split(" ").map((x) => x.trim()).filter(Boolean);
  if (parts.length < 3) return ctx.reply("Format: /addsaldo <userId> <amount>");

  const uid = Number(parts[1]);
  const amt = Number(parts[2]);
  if (!Number.isFinite(uid) || !Number.isFinite(amt) || amt <= 0) return ctx.reply("Input tidak valid.");

  await User.updateOne({ tgId: uid }, { $inc: { balance: amt } }, { upsert: true });
  ctx.reply(`OK. Saldo user ${uid} +${money(amt)}`);
});

// Admin: add product
bot.command("addproduct", async (ctx) => {
  const tgId = ctx.from.id;
  if (!isAdmin(tgId)) return ctx.reply("Kamu bukan admin.");

  // /addproduct CODE | Nama Produk | kategori | harga | provider(optional)
  const raw = ctx.message.text.replace(/^\/addproduct\s*/i, "");
  const parts = raw.split("|").map((x) => x.trim());
  if (parts.length < 4) {
    return ctx.reply("Format:\n/addproduct CODE | Nama | kategori | harga | provider(optional)");
  }

  const code = parts[0].toUpperCase();
  const name = parts[1];
  const category = parts[2] || "pulsa";
  const price = Number(parts[3]);
  const provider = (parts[4] || "orderkuota").toLowerCase();

  if (!code || !name || !Number.isFinite(price)) return ctx.reply("Input tidak valid.");

  await Product.updateOne(
    { code },
    { $set: { code, name, category, price, provider, active: true } },
    { upsert: true }
  );

  ctx.reply(`OK. Produk tersimpan:\n${name}\nCode: ${code}\nHarga: ${money(price)}\nProvider: ${provider}`);
});

// Admin: add voucher
bot.command("addvoucher", async (ctx) => {
  const tgId = ctx.from.id;
  if (!isAdmin(tgId)) return ctx.reply("Kamu bukan admin.");

  // /addvoucher CODE | PERCENT/FLAT | value | minAmount | maxDiscount | usageLimit
  const raw = ctx.message.text.replace(/^\/addvoucher\s*/i, "");
  const parts = raw.split("|").map((x) => x.trim());
  if (parts.length < 3) {
    return ctx.reply("Format:\n/addvoucher CODE | PERCENT/FLAT | value | minAmount(optional) | maxDiscount(optional) | usageLimit(optional)");
  }

  const code = parts[0].toUpperCase();
  const type = (parts[1] || "PERCENT").toUpperCase();
  const value = Number(parts[2]);
  const minAmount = Number(parts[3] || 0);
  const maxDiscount = Number(parts[4] || 0);
  const usageLimit = Number(parts[5] || 0);

  if (!code || !["PERCENT", "FLAT"].includes(type) || !Number.isFinite(value) || value <= 0) {
    return ctx.reply("Input voucher tidak valid.");
  }

  await Voucher.updateOne(
    { code },
    { $set: { code, type, value, minAmount, maxDiscount, usageLimit, active: true } },
    { upsert: true }
  );

  ctx.reply(`OK. Voucher tersimpan:\nCode: ${code}\nType: ${type}\nValue: ${value}`);
});

// ----------------- Callback menu -----------------
bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data;
  const tgId = ctx.from.id;

  try {
    if (data === "BACK_MENU") {
      await resetState(tgId);
      await ctx.editMessageText("Menu:", mainMenu());
      return;
    }

    if (data === "MENU_BALANCE") {
      const u = await getOrCreateUser(ctx);
      await ctx.editMessageText(`Saldo kamu: *${money(u.balance)}*`, { parse_mode: "Markdown", ...mainMenu() });
      return;
    }

    if (data === "MENU_PRODUCTS") {
      const text = await listProductsText();
      await ctx.editMessageText(text, { parse_mode: "Markdown", ...mainMenu() });
      return;
    }

    if (data === "MENU_TRX") {
      const items = await Transaction.find({ tgId }).sort({ createdAt: -1 }).limit(10);
      let out = items.length ? "🧾 *10 Transaksi Terakhir*\n\n" : "Belum ada transaksi.";
      if (items.length) {
        for (const t of items) {
          out += `• \`${t.trxId}\` - *${t.status}*\n  ${t.productName} → ${t.target}\n  ${money(t.amount)}\n\n`;
        }
      }
      await ctx.editMessageText(out, { parse_mode: "Markdown", ...mainMenu() });
      return;
    }

    if (data === "MENU_VOUCHER") {
      await setState(tgId, "VOUCHER_INPUT", {});
      await ctx.editMessageText(
        "Kirim kode voucher kamu (contoh: DISKON10).\n\nCatatan: voucher bisa dipakai saat order dengan format `VOUCHER:KODE` di akhir target.",
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Kembali", "BACK_MENU")]]) }
      );
      return;
    }

    if (data === "MENU_ORDER") {
      const kb = await buildProductKeyboard();
      if (!kb) return ctx.editMessageText("Belum ada produk aktif.", mainMenu());
      await resetState(tgId);
      await ctx.editMessageText("Pilih produk:", kb);
      return;
    }

    if (data.startsWith("PICK_")) {
      const code = data.replace("PICK_", "");
      const p = await Product.findOne({ code, active: true });
      if (!p) return ctx.answerCbQuery("Produk tidak ditemukan.");

      await setState(tgId, "ORDER_INPUT", { productCode: p.code });
      await ctx.editMessageText(
        `Produk dipilih: *${p.name}*\nHarga: *${money(p.price)}*\n\nSekarang kirim *target* (nomor / id tujuan).\n\nKalau pakai voucher: contoh\n\`0812xxxx VOUCHER:DISKON10\``,
        { parse_mode: "Markdown", ...Markup.inlineKeyboard([[Markup.button.callback("⬅️ Batal", "BACK_MENU")]]) }
      );
      return;
    }

    if (data === "MENU_ADMIN") {
      if (!isAdmin(tgId)) return ctx.answerCbQuery("Kamu bukan admin.");
      await ctx.editMessageText(
        "Admin menu:\n" +
          "• /addsaldo <userId> <amount>\n" +
          "• /addproduct CODE | Nama | kategori | harga | provider\n" +
          "• /addvoucher CODE | PERCENT/FLAT | value | minAmount | maxDiscount | usageLimit\n",
        mainMenu()
      );
      return;
    }

    await ctx.answerCbQuery("OK");
  } catch (e) {
    logger.error({ e }, "callback error");
    try {
      await ctx.answerCbQuery("Error.");
    } catch {}
  }
});

// ----------------- Stateful text handler -----------------
bot.on("text", async (ctx) => {
  const tgId = ctx.from.id;
  const text = (ctx.message.text || "").trim();

  const u = await getOrCreateUser(ctx);
  const step = u.state?.step || "";
  const temp = u.state?.temp || {};

  if (!step) return;

  // Voucher input (just validate & acknowledge)
  if (step === "VOUCHER_INPUT") {
    const code = text.toUpperCase();
    const v = await Voucher.findOne({ code, active: true });

    await resetState(tgId);

    if (!v) return ctx.reply("Voucher tidak valid / nonaktif.", mainMenu());
    return ctx.reply(`Voucher *${code}* terdeteksi. Pakai saat order: \`VOUCHER:${code}\``, { parse_mode: "Markdown", ...mainMenu() });
  }

  // Order input
  if (step === "ORDER_INPUT") {
    const productCode = temp.productCode;
    const p = await Product.findOne({ code: productCode, active: true });
    if (!p) {
      await resetState(tgId);
      return ctx.reply("Produk sudah tidak tersedia.", mainMenu());
    }

    // parse voucher
    let voucherCode = "";
    let cleanTarget = text;
    const m = text.match(/\bVOUCHER:([A-Z0-9_-]{3,30})\b/i);
    if (m) {
      voucherCode = m[1].toUpperCase();
      cleanTarget = text.replace(m[0], "").trim();
    }

    const trxId = uuidv4().replace(/-/g, "").slice(0, 16).toUpperCase();

    const baseAmount = p.price;
    const { discount, voucher, reason } = await applyVoucher({ tgId, voucherCode, amount: baseAmount });

    if (voucherCode && !voucher) {
      await resetState(tgId);
      return ctx.reply(`Voucher gagal: ${reason}`, mainMenu());
    }

    const fee = Math.ceil((baseAmount - discount) * (CFG.QRIS_FEE_PERCENTAGE / 100));
    const finalAmount = Math.max(0, baseAmount - discount + fee);

    const trx = await Transaction.create({
      trxId,
      tgId,
      productCode: p.code,
      productName: p.name,
      target: cleanTarget,
      amount: finalAmount,
      discount,
      fee,
      status: "PENDING",
      gateway: p.provider
    });

    await resetState(tgId);

    // If provider is saldo -> pay instantly
    if (p.provider === "saldo") {
      const freshUser = await User.findOne({ tgId });
      if ((freshUser?.balance || 0) < finalAmount) {
        trx.status = "FAILED";
        await trx.save();
        return ctx.reply(`Saldo kurang.\nButuh ${money(finalAmount)} tapi saldo kamu ${money(freshUser?.balance || 0)}.`, mainMenu());
      }

      await User.updateOne({ tgId }, { $inc: { balance: -finalAmount } });
      trx.status = "PAID";
      trx.gateway = "saldo";
      await trx.save();

      await ctx.reply(`Pembayaran via saldo OK.\nTrx: *${trxId}*\nStatus: *PAID*`, { parse_mode: "Markdown" });

      // process order to provider if orderkuota enabled and provider is orderkuota
      if (orderkuota && p.provider === "orderkuota") {
        trx.status = "PROCESSING";
        await trx.save();

        try {
          const resp = await orderkuota.createOrder({ trxId, productCode: p.code, target: cleanTarget });
          trx.raw = resp;
          trx.status = "SUCCESS";
          await trx.save();
          return ctx.reply(`Order diproses.\nTrx: *${trxId}*\nStatus: *SUCCESS*`, { parse_mode: "Markdown", ...mainMenu() });
        } catch (e) {
          trx.status = "REVIEW";
          trx.raw = { error: String(e?.message || e) };
          await trx.save();
          return ctx.reply(`Order gagal otomatis. Masuk *REVIEW*.\nTrx: *${trxId}*`, { parse_mode: "Markdown", ...mainMenu() });
        }
      }

      // mark voucher used
      if (voucher) {
        await User.updateOne({ tgId }, { $addToSet: { redeemedVouchers: voucher.code } });
        await Voucher.updateOne({ code: voucher.code }, { $inc: { usedCount: 1 } });
      }

      return ctx.reply(`Trx dibuat: *${trxId}*\nStatus: *PAID*\nProvider: ${p.provider}`, { parse_mode: "Markdown", ...mainMenu() });
    }

    // Non-saldo payment: placeholder invoice (implement gateway later)
    let payInfo =
      `🧾 Transaksi dibuat\n\n` +
      `Trx: *${trxId}*\nProduk: *${p.name}*\nTarget: \`${cleanTarget}\`\n` +
      `Harga: ${money(baseAmount)}\nDiskon: ${money(discount)}\nFee: ${money(fee)}\nTotal: *${money(finalAmount)}*\n\n` +
      `Status: *PENDING*\nGateway: *${p.provider}*\n`;

    // optional: create invoice stub for Pakasir/Qiospay (placeholder)
    try {
      if (p.provider === "pakasir" && pakasir) {
        const inv = await pakasir.createInvoice({
          trxId,
          amount: finalAmount,
          description: `Order ${p.name} (${cleanTarget})`,
          callbackUrl: `${CFG.SERVER_BASE_URL}/callback/pakasir`
        });
        trx.gatewayRef = String(inv?.id || inv?.invoice_id || "");
        trx.raw = inv;
        await trx.save();
        payInfo += `\nInvoice dibuat (Pakasir). Ref: \`${trx.gatewayRef || "-"}\``;
      }

      if (p.provider === "qiospay" && qiospay) {
        const inv = await qiospay.createPayment({
          trxId,
          amount: finalAmount,
          description: `Order ${p.name} (${cleanTarget})`
        });
        trx.gatewayRef = String(inv?.id || inv?.ref || "");
        trx.raw = inv;
        await trx.save();
        payInfo += `\nInvoice dibuat (Qiospay). Ref: \`${trx.gatewayRef || "-"}\``;
      }
    } catch (e) {
      trx.status = "REVIEW";
      trx.raw = { error: String(e?.message || e) };
      await trx.save();
      payInfo += `\n\nGateway error, transaksi masuk *REVIEW*.`;
    }

    // mark voucher used (when trx created)
    if (voucher) {
      await User.updateOne({ tgId }, { $addToSet: { redeemedVouchers: voucher.code } });
      await Voucher.updateOne({ code: voucher.code }, { $inc: { usedCount: 1 } });
    }

    return ctx.reply(payInfo, { parse_mode: "Markdown", ...mainMenu() });
  }
});

// ----------------- WEB ADMIN (monitor/report) -----------------
async function startWeb() {
  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "public")));

  app.get("/api/health", async (req, res) => {
    const report = await healthReport({
      mongoose,
      gatewayChecks: {
        pakasir: async () => {
          if (!pakasir) throw new Error("disabled");
        },
        orderkuota: async () => {
          if (!orderkuota) throw new Error("disabled");
        },
        qiospay: async () => {
          if (!qiospay) throw new Error("disabled");
        }
      }
    });
    res.json(report);
  });

  app.get("/api/products", async (req, res) => {
    const items = await Product.find({}).sort({ createdAt: -1 }).limit(200);
    res.json(items);
  });

  // REPORT: jumlah barang dibeli + revenue
  app.get("/api/report/products", async (req, res) => {
    const days = Math.max(1, Math.min(365, Number(req.query.days || 30)));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await Transaction.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { code: "$productCode", name: "$productName" },
          totalTrx: { $sum: 1 },
          successTrx: { $sum: { $cond: [{ $eq: ["$status", "SUCCESS"] }, 1, 0] } },
          paidTrx: { $sum: { $cond: [{ $in: ["$status", ["PAID", "PROCESSING", "SUCCESS"]] }, 1, 0] } },
          pendingTrx: { $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, 1, 0] } },
          failedTrx: { $sum: { $cond: [{ $in: ["$status", ["FAILED", "CANCELED"]] }, 1, 0] } },
          reviewTrx: { $sum: { $cond: [{ $eq: ["$status", "REVIEW"] }, 1, 0] } },
          revenueAll: { $sum: "$amount" },
          revenueSuccess: { $sum: { $cond: [{ $eq: ["$status", "SUCCESS"] }, "$amount", 0] } }
        }
      },
      { $sort: { successTrx: -1, totalTrx: -1 } }
    ]);

    res.json({
      range_days: days,
      since,
      rows: rows.map((r) => ({
        productCode: r._id.code,
        productName: r._id.name,
        totalTrx: r.totalTrx,
        successTrx: r.successTrx,
        paidTrx: r.paidTrx,
        pendingTrx: r.pendingTrx,
        failedTrx: r.failedTrx,
        reviewTrx: r.reviewTrx,
        revenueAll: r.revenueAll,
        revenueSuccess: r.revenueSuccess
      }))
    });
  });

  app.listen(CFG.PORT, () => {
    logger.info(`Web admin listening on http://0.0.0.0:${CFG.PORT}`);
  });
}

// ----------------- BOOTSTRAP -----------------
(async () => {
  try {
    await connectMongo(CFG.MONGO_URI);

    // Seed contoh product kalau kosong
    const count = await Product.countDocuments({});
    if (count === 0) {
      await Product.create({
        code: "TEST10",
        name: "TEST Produk 10K",
        category: "pulsa",
        price: 10000,
        provider: "saldo",
        active: true
      });
      logger.info("Seed sample product created: TEST10");
    }

    await startWeb(); // monitoring + report
    await bot.launch();
    logger.info("BOT-AUTO started.");
  } catch (e) {
    logger.error({ e }, "Fatal start error");
    process.exit(1);
  }
})();
