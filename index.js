import express from "express";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import fetch from 'node-fetch';
import path from 'path';
import { fileURLToPath } from 'url';
import { createPayment, getPaymentById, completePayment, listPayments, migrate } from './db/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "test_secret";

function signPayload(payload) {
  return crypto.createHmac("sha256", WEBHOOK_SECRET).update(JSON.stringify(payload)).digest("hex");
}

function createUpiDeepLink({ vpa, payee_name, amount, txn }) {
  const pa = encodeURIComponent(vpa || `test@upi`);
  const pn = encodeURIComponent(payee_name || "Bhoomiloop");
  const am = encodeURIComponent(amount.toString());
  const tn = encodeURIComponent(txn || "");
  return `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR&tn=${tn}`;
}

// Ensure migrations run before starting server
(async () => {
  try {
    await migrate();
    console.log('DB migrations applied');
  } catch (err) {
    console.warn('Failed to run migrations at startup:', err.message);
  }

  // Create payment
  app.post("/payments", async (req, res) => {
    const { amount, currency = "INR", vpa, payee_name, purpose, metadata, webhook_url } = req.body;
    if (!amount) return res.status(400).json({ error: "amount required" });

    const id = uuidv4();
    const payment = await createPayment({ payment_id: id, amount, currency, vpa: vpa || `test@upi`, payee_name: payee_name || 'Bhoomiloop', purpose: purpose || '', metadata: metadata || {}, webhook_url: webhook_url || null });

    const deeplink = createUpiDeepLink({ vpa: payment.vpa, payee_name: payment.payee_name, amount, txn: id });
    return res.json({
      payment_id: id,
      status: payment.status,
      upi_deeplink: deeplink,
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
    });
  });

  // Get payment
  app.get("/payments/:id", async (req, res) => {
    const p = await getPaymentById(req.params.id);
    if (!p) return res.status(404).json({ error: "not found" });
    res.json(p);
  });

  // Complete payment (simulate bank/GW callback)
  app.post("/payments/:id/complete", async (req, res) => {
    const p = await getPaymentById(req.params.id);
    if (!p) return res.status(404).json({ error: "not found" });

    const { status, txn_id } = req.body;
    if (!["SUCCESS", "FAILURE"].includes(status)) return res.status(400).json({ error: "invalid status" });

    const updated = await completePayment(p.payment_id, status, txn_id);

    // send webhook if configured
    if (updated.webhook_url) {
      const payload = { payment_id: updated.payment_id, status: updated.status, txn_id: updated.txn_id, amount: updated.amount };
      const signature = signPayload(payload);
      try {
        await fetch(updated.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Signature": signature },
          body: JSON.stringify(payload)
        });
      } catch (err) {
        console.warn("Webhook send failed:", err.message);
      }
    }

    res.json(updated);
  });

  // Admin: list payments (for test)
  app.get("/admin/payments", async (req, res) => {
    const rows = await listPayments();
    res.json(rows);
  });

  app.listen(PORT, () => {
    console.log(`Mock UPI server running on http://localhost:${PORT}`);
  });
})();
