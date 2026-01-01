const axios = require("axios");

function pakasirClient({ slug, apiKey }) {
  const http = axios.create({
    baseURL: `https://pakasir.com/api/projects/${encodeURIComponent(slug)}`,
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    }
  });

  return {
    async createInvoice({ trxId, amount, description, callbackUrl }) {
      // Placeholder: sesuaikan endpoint sesuai docs Pakasir kamu
      const { data } = await http.post(`/invoices`, {
        external_id: trxId,
        amount,
        description,
        callback_url: callbackUrl
      });
      return data;
    },

    async getInvoice(ref) {
      const { data } = await http.get(`/invoices/${encodeURIComponent(ref)}`);
      return data;
    }
  };
}

module.exports = { pakasirClient };
