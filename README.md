# Bhoomiloop UPI Mock Server

This repository contains a small mock UPI payment server you can use for development and testing of Bhoomiloop's payment flows.

Features
- POST /payments — create a payment and receive a UPI deeplink
- GET /payments/:id — query payment status
- POST /payments/:id/complete — simulate a bank/gateway callback (SUCCESS or FAILURE)
- Optional webhook delivery to your backend with HMAC-SHA256 signature

Quick start
1. Install dependencies:

   npm install

2. Run locally:

   WEBHOOK_SECRET=your_secret npm start

3. Create a payment (example):

   curl -X POST http://localhost:4000/payments -H "Content-Type: application/json" -d '{"amount":100, "vpa":"test@upi", "payee_name":"Bhoomiloop", "webhook_url":"http://your-backend/webhook/upi"}'

4. Simulate completion:

   curl -X POST http://localhost:4000/payments/<payment_id>/complete -H "Content-Type: application/json" -d '{"status":"SUCCESS","txn_id":"BANK12345"}'

Notes
- This mock uses an in-memory store. Restarting the server clears payments.
- For CI or longer-lived tests, consider adding SQLite or Postgres persistence.

See index.js for implementation details.
