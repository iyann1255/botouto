const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema(
  {
    trxId: { type: String, required: true, unique: true, index: true },
    tgId: { type: Number, required: true, index: true },

    productCode: { type: String, required: true },
    productName: { type: String, default: "" },
    target: { type: String, required: true },

    amount: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    fee: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["PENDING", "PAID", "PROCESSING", "SUCCESS", "FAILED", "CANCELED", "REVIEW"],
      default: "PENDING",
      index: true
    },

    gateway: { type: String, default: "" },
    gatewayRef: { type: String, default: "" },
    raw: { type: Object, default: {} }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Transaction", TransactionSchema);
