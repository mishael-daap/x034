# Paystack Integration Guide — Purchases & Payouts (Next.js API Routes)

This covers the essential Paystack endpoints for a **purchase (payment)** flow and a **payout (transfer)** flow, mapped to Next.js API routes.

---

## 1. Purchases — Accept Payments

**Flow:** initialize → customer pays via Popup/redirect → verify → (webhook confirms).

### Initialize Transaction

Call this from a Next.js API route (never the client — it needs your secret key).

```
POST https://api.paystack.co/transaction/initialize
Headers: Authorization: Bearer YOUR_SECRET_KEY
Body: { "email": "customer@email.com", "amount": "500000", "callback_url": "..." }
```

Returns `authorization_url`, `access_code`, `reference`. Your frontend either redirects to `authorization_url` or uses `access_code` with Paystack Popup (`popup.resumeTransaction(access_code)`).

> `amount` is always in the **subunit** of the currency (kobo for NGN, so ₦5,000 = `"500000"`). All requests to the Paystack API should be initiated from your server — this maps perfectly to a Next.js API route acting as that server, so your secret key is never exposed on the frontend.

### Verify Transaction

Poll this after the redirect callback, or use it as a backup to the webhook.

```
GET https://api.paystack.co/transaction/verify/:reference
Headers: Authorization: Bearer YOUR_SECRET_KEY
```

Check `data.status === "success"` and **`data.amount` matches what you expect** before delivering value. If the amount doesn't match, don't deliver value to the customer.

### Sample: `/pages/api/transactions/initialize.js`

```js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { email, amount } = req.body;

  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, amount, callback_url: `${process.env.APP_URL}/payment/callback` }),
  });
  const data = await response.json();
  res.status(response.status).json(data);
}
```

### Sample: `/pages/api/transactions/verify.js`

```js
export default async function handler(req, res) {
  const { reference } = req.query;
  const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  });
  const data = await response.json();
  if (data.data.status === 'success') {
    // credit order/wallet in your DB, check data.data.amount matches
  }
  res.status(response.status).json(data);
}
```

---

## 2. Payouts — Transfers

**Flow:** create transfer recipient → generate a reference → initiate transfer → confirm via webhook (preferred) or verify endpoint.

### Create Transfer Recipient

```
POST https://api.paystack.co/transferrecipient
Body: {
  "type": "nuban",
  "name": "John Doe",
  "account_number": "0001234567",
  "bank_code": "058",
  "currency": "NGN"
}
```

Save the returned `recipient_code` — it's the unique identifier used to make transfers to that account, and should be saved with the customer's records in your database. For Nigeria, first resolve/verify the account number before creating the recipient.

### Initiate Transfer

```
POST https://api.paystack.co/transfer
Body: {
  "source": "balance",
  "amount": 100000,
  "reference": "your_unique_ref",
  "recipient": "RCP_xxx",
  "reason": "Payout"
}
```

**Reference rules:** lowercase letters, digits, underscore (`_`) and dash (`-`) only; minimum 16 characters, maximum 50 characters. Use a UUID.

> If there's an error with the transfer request, **retry with the same reference** to avoid double crediting. A new reference is treated as a new request.

> For a fully automated payout system, disable the OTP confirmation step in your Paystack dashboard preferences (**Settings → Preferences → uncheck "Confirm transfers before sending"**), otherwise transfers pause for manual OTP approval.

### Verify Transfer (polling fallback)

```
GET https://api.paystack.co/transfer/verify/:reference
```

### Sample: `/pages/api/payouts/initiate.js`

```js
import { randomUUID } from 'crypto';

export default async function handler(req, res) {
  const { amount, recipientCode, reason } = req.body;
  const reference = `payout_${randomUUID()}`;

  const response = await fetch('https://api.paystack.co/transfer', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ source: 'balance', amount, recipient: recipientCode, reason, reference }),
  });
  const data = await response.json();
  // store reference + status='pending' in your DB, update on webhook
  res.status(response.status).json(data);
}
```

---

## 3. Webhooks (critical for both flows)

Use a single endpoint, e.g. `/pages/api/webhooks/paystack.js`. You must verify the `x-paystack-signature` header (HMAC SHA512 with your secret key) and return `200` fast.

```js
import crypto from 'crypto';

export const config = { api: { bodyParser: false } }; // need raw body for signature check

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  const rawBody = await getRawBody(req);
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(401).end();
  }

  const event = JSON.parse(rawBody.toString());
  res.status(200).end(); // ack immediately

  switch (event.event) {
    case 'charge.success':
      // fulfill order
      break;
    case 'transfer.success':
    case 'transfer.failed':
    case 'transfer.reversed':
      // update payout record in your DB
      break;
  }
}
```

**Key events to handle:**

| Event | Meaning |
|---|---|
| `charge.success` | A successful payment/purchase |
| `transfer.success` | A payout completed successfully |
| `transfer.failed` | A payout attempt failed |
| `transfer.reversed` | A payout was refunded back to your balance |

> In live mode, webhook events are retried every 3 minutes for the first 4 tries, then hourly for 72 hours if you don't return `200 OK`. Avoid long-running work directly in the handler — acknowledge first, then queue the follow-up work.

---

## Environment Variables

| Variable | Used where | Notes |
|---|---|---|
| `PAYSTACK_SECRET_KEY` | Server-only (API routes) | Never expose to the client |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Client | Only needed if using Popup directly instead of redirect |

---

## Possible Next Additions

- **Resolve Account Number** — verify bank details before creating a transfer recipient
- **Bulk Transfers** — for batch payouts to multiple recipients in one request