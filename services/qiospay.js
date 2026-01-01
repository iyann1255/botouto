const axios = require("axios");

function qiospayClient({ merchantCode, apiKey }) {
  const http = axios.create({
    baseURL: "https://api.qiospay.com",
    timeout: 15000,
    headers: { "Content-Type": "application/json" }
  });

  return {
    async createPayment({ trxId, amount, description }) {
      // Placeholder endpoint
      const { data } = await http.post("/v1/payment/create", {
        merchant_code: merchantCode,
        api_key: apiKey,
        ref_id: trxId,
        amount,
        description
      });
      return data;
    },

    async checkPayment({ trxId }) {
      const { data } = await http.post("/v1/payment/status", {
        merchant_code: merchantCode,
        api_key: apiKey,
        ref_id: trxId
      });
      return data;
    }
  };
}

module.exports = { qiospayClient };
