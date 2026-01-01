const axios = require("axios");

function pteroClient({ panelUrl, appApiKey }) {
  const http = axios.create({
    baseURL: `${panelUrl.replace(/\/$/, "")}/api/application`,
    timeout: 20000,
    headers: {
      Authorization: `Bearer ${appApiKey}`,
      Accept: "Application/vnd.pterodactyl.v1+json",
      "Content-Type": "application/json"
    }
  });

  return {
    async createServer(payload) {
      const { data } = await http.post("/servers", payload);
      return data;
    }
  };
}

module.exports = { pteroClient };
