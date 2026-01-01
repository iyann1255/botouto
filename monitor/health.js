const { logger } = require("../logger");

async function healthReport(deps) {
  const result = { mongo: "UNKNOWN", gateways: {} };

  try {
    result.mongo = deps?.mongoose?.connection?.readyState === 1 ? "OK" : "DOWN";
  } catch {
    result.mongo = "DOWN";
  }

  for (const [name, fn] of Object.entries(deps?.gatewayChecks || {})) {
    try {
      await fn();
      result.gateways[name] = "OK";
    } catch (e) {
      logger.warn({ e }, `Gateway ${name} DOWN`);
      result.gateways[name] = "DOWN";
    }
  }

  return result;
}

module.exports = { healthReport };
