# BOT-AUTO

Telegram auto order bot (Telegraf + MongoDB) + monitoring/report via web.

## Install
```bash
cd BOT-AUTO
cp .env.example .env
nano .env
npm install
npm start
```

## Command Admin
- /addsaldo <userId> <amount>
- /addproduct CODE | Nama | kategori | harga | provider
- /addvoucher CODE | PERCENT/FLAT | value | minAmount | maxDiscount | usageLimit

## Monitoring Web
Buka:
- http://IP:3000/
API:
- /api/health
- /api/products
- /api/report/products?days=30
```
