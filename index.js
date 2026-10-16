import express from "express";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || "test_secret";

// In-memory store
const payments = new Map();

// helpers
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

// Create payment
app.post("/payments", (req, res) => {
  const { amount, currency = "INR", vpa, payee_name, purpose, metadata, webhook_url } = req.body;
  if (!amount) return res.status(400).json({ error: "amount required" });

  const id = uuidv4();
  const now = new Date().toISOString();
  const payment = {
    payment_id: id,
    amount,
    currency,
    vpa: vpa || `test@upi`,
    payee_name: payee_name || "Bhoomiloop",
    purpose: purpose || "",
    metadata: metadata || {},
    status: "PENDING",
    txn_id: null,
    created_at: now,
    updated_at: now,
    webhook_url: webhook_url || null
  };
  payments.set(id, payment);

  const deeplink = createUpiDeepLink({ vpa: payment.vpa, payee_name: payment.payee_name, amount, txn: id });
  return res.json({
    payment_id: id,
    status: payment.status,
    upi_deeplink: deeplink,
    expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString()
  });
});

// Get payment
app.get("/payments/:id", (req, res) => {
  const p = payments.get(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });
  res.json(p);
});

// Complete payment (simulate bank/GW callback)
app.post("/payments/:id/complete", async (req, res) => {
  const p = payments.get(req.params.id);
  if (!p) return res.status(404).json({ error: "not found" });

  const { status, txn_id } = req.body;
  if (!["SUCCESS", "FAILURE"].includes(status)) return res.status(400).json({ error: "invalid status" });

  // idempotency: don't change if already final
  if (p.status === "SUCCESS" || p.status === "FAILURE") {
    return res.json(p);
  }

  p.status = status;
  p.txn_id = txn_id || `TXN-${Math.random().toString(36).slice(2, 10)}`;
  p.updated_at = new Date().toISOString();
  payments.set(p.payment_id, p);

  // send webhook if configured
  if (p.webhook_url) {
    const payload = { payment_id: p.payment_id, status: p.status, txn_id: p.txn_id, amount: p.amount };
    const signature = signPayload(payload);
    try {
      await fetch(p.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Signature": signature },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn("Webhook send failed:", err.message);
    }
  }

  res.json(p);
});

// Admin: list payments (for test)
app.get("/admin/payments", (req, res) => {
  res.json(Array.from(payments.values()));
});

app.listen(PORT, () => {
  console.log(`Mock UPI server running on http://localhost:${PORT}`);
});
