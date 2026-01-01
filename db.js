const mongoose = require("mongoose");
const { logger } = require("./logger");

async function connectMongo(uri) {
  mongoose.set("strictQuery", true);

  mongoose.connection.on("connected", () => logger.info("MongoDB connected"));
  mongoose.connection.on("error", (e) => logger.error({ e }, "MongoDB error"));
  mongoose.connection.on("disconnected", () => logger.warn("MongoDB disconnected"));

  await mongoose.connect(uri, { autoIndex: true });
}

module.exports = { connectMongo };
