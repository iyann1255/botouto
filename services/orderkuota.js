const axios = require("axios");

function orderkuotaClient({ username, token }) {
  const http = axios.create({
    baseURL: "https://api.orderkuota.com",
    timeout: 15000,
    headers: { "Content-Type": "application/json" }
  });

  return {
    async createOrder({ trxId, productCode, target }) {
      // Placeholder endpoint
      const { data } = await http.post("/v1/order", {
        username,
        auth_token: token,
        ref_id: trxId,
        product_code: productCode,
        target
      });
      return data;
    },

    async checkOrder({ trxId }) {
      const { data } = await http.post("/v1/status", {
        username,
        auth_token: token,
        ref_id: trxId
      });
      return data;
    }
  };
}

module.exports = { orderkuotaClient };
