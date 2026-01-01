const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    tgId: { type: Number, required: true, unique: true, index: true },
    username: { type: String, default: "" },
    firstName: { type: String, default: "" },

    balance: { type: Number, default: 0 },
    redeemedVouchers: { type: [String], default: [] },

    state: {
      step: { type: String, default: "" },
      temp: { type: Object, default: {} }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
