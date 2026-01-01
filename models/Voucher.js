const mongoose = require("mongoose");

const VoucherSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ["PERCENT", "FLAT"], default: "PERCENT" },
    value: { type: Number, required: true },

    minAmount: { type: Number, default: 0 },
    maxDiscount: { type: Number, default: 0 }, // 0 = unlimited
    active: { type: Boolean, default: true },

    usageLimit: { type: Number, default: 0 }, // 0 = unlimited
    usedCount: { type: Number, default: 0 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Voucher", VoucherSchema);
