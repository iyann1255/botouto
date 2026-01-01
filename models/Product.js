const mongoose = require("mongoose");

const ProductSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    category: { type: String, default: "pulsa" },
    price: { type: Number, required: true },
    baseCost: { type: Number, default: 0 },
    active: { type: Boolean, default: true },

    // orderkuota/pakasir/qiospay/saldo/manual
    provider: { type: String, default: "orderkuota" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", ProductSchema);
