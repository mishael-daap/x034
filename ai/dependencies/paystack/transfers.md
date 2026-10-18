# Paystack Payouts (Transfers) – Implementation Reference for Next.js

> **Purpose:** Reference for building a payouts endpoint in a Next.js (App Router, TypeScript) app using Paystack.
> **Source:** Paystack API docs – Introduction, Transfer Recipients, Transfers
> (https://paystack.com/docs/api/, `/transfer-recipient/`, `/transfer/`).
> **Terminology:** Paystack calls payouts **Transfers**. There is no endpoint literally named "payouts".

---

## 1. API Basics

- **Base URL:** `https://api.paystack.co` (same for test and live; the API key determines the environment)
- **Auth header (every request):** `Authorization: Bearer YOUR_SECRET_KEY`
- **Content type:** `Content-Type: application/json`
- HTTPS only.
- **Response envelope:**
  ```json
  { "status": true, "message": "string", "data": {} }
  ```
  Use `status` together with the HTTP status code to determine success. List endpoints also return a `meta` object (`total`, `skipped`, `perPage`, `page`, `pageCount`).
- **Amounts are in the currency subunit.** NGN → kobo (`₦1,000 = 100000`). GHS → pesewas. Always multiply the base amount by 100.
- The **secret key must only be used server-side**. Never expose it to the browser or use a `NEXT_PUBLIC_` prefix.

---

## 2. Payout Flow

1. **Create a transfer recipient** → get a `recipient_code` (`RCP_...`).
2. **Initiate a transfer** to that recipient → get a `transfer_code` (`TRF_...`).
3. **If OTP is enabled** on the account, the transfer status is `otp`; call **Finalize Transfer** with the OTP.
4. **Confirm the final status** via webhooks (preferred) and/or **Verify Transfer** by reference.

> ⚠️ A success response from `POST /transfer` means the transfer was **queued**, not delivered. The docs' sample responses show `"message": "Transfer has been queued"` even with `"status": "success"`. Treat webhooks as the source of truth for the final outcome.

---

## 3. Endpoints

### 3.1 Create Transfer Recipient

`POST /transferrecipient`

Creates a new recipient. A duplicate account number returns the existing record (safe to call repeatedly).

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | string | yes | One of `nuban`, `ghipss`, `mobile_money`, `basa` |
| `name` | string | yes | Recipient's name as registered on the account |
| `account_number` | string | yes* | *Required for all types except `authorization` |
| `bank_code` | string | yes* | *Required for all types except `authorization`. Get codes from **List Banks** (`GET /bank`) |
| `description` | string | no | |
| `currency` | string | no | Currency of the receiving account |
| `authorization_code` | string | no | From a previous transaction |
| `metadata` | object | no | Free-form JSON |

**Example request body**
```json
{
  "type": "nuban",
  "name": "Tolu Robert",
  "account_number": "01000000010",
  "bank_code": "058",
  "currency": "NGN"
}
```

**Example response (200)**
```json
{
  "status": true,
  "message": "Transfer recipient created successfully",
  "data": {
    "active": true,
    "currency": "NGN",
    "domain": "test",
    "id": 20317609,
    "name": "Tolu Robert",
    "recipient_code": "RCP_m7ljkv8leesep7p",
    "type": "nuban",
    "is_deleted": false,
    "details": {
      "authorization_code": null,
      "account_number": "01000000010",
      "account_name": "Tolu Robert",
      "bank_code": "058",
      "bank_name": "Guaranty Trust Bank"
    }
  }
}
```

### 3.2 Other Recipient Endpoints

| Action | Method & Path | Notes |
|---|---|---|
| Bulk create | `POST /transferrecipient/bulk` | Body: `{ "batch": [ {type, name, account_number, bank_code, currency}, ... ] }`. Response `data` has `success` and `errors` arrays. |
| List | `GET /transferrecipient` | Query: `perPage` (default 50), `page` (default 1), `from`, `to` |
| Fetch | `GET /transferrecipient/:id_or_code` | |
| Update | `PUT /transferrecipient/:id_or_code` | Body: `name`, optional `email` |
| Delete | `DELETE /transferrecipient/:id_or_code` | Sets the recipient to inactive |

---

### 3.3 Initiate Transfer

`POST /transfer`

| Field | Type | Required | Notes |
|---|---|---|---|
| `source` | string | yes | Only `"balance"` is supported |
| `amount` | integer | yes | In kobo (NGN) / pesewas (GHS) |
| `recipient` | string | yes | The `recipient_code` |
| `reference` | string | yes | **16–50 chars**, only lowercase `a-z`, digits `0-9`, `-` and `_`. Must be unique. |
| `reason` | string | no | Shows in the recipient's credit narration |
| `currency` | string | no | Defaults to NGN |
| `account_reference` | string | no | Required in Kenya for M-PESA Paybill/Till transfers |

**Example request body**
```json
{
  "source": "balance",
  "amount": 100000,
  "recipient": "RCP_gd9vgag7n5lr5ix",
  "reference": "acv_9ee55786-2323-4760-98e2-6380c9cb3f68",
  "reason": "Bonus for the week"
}
```

**Example response (200)**
```json
{
  "status": true,
  "message": "Transfer has been queued",
  "data": {
    "domain": "test",
    "amount": 100000,
    "currency": "NGN",
    "reference": "acv_9ee55786-2323-4760-98e2-6380c9cb3f68",
    "source": "balance",
    "reason": "Bonus for the week",
    "status": "success",
    "transfer_code": "TRF_v5tip3zx8nna9o78",
    "id": 860703114,
    "recipient": 56824902,
    "createdAt": "2025-08-04T10:32:40.000Z",
    "updatedAt": "2025-08-04T10:32:40.000Z"
  }
}
```

**Status behaviour:** `pending` if OTP is disabled; `otp` if an OTP is required to finalize.

### 3.4 Finalize Transfer (only when OTP is enabled)

`POST /transfer/finalize_transfer`

```json
{ "transfer_code": "TRF_vsyqdmlzble3uii", "otp": "928783" }
```

The OTP is sent to the business phone number.

### 3.5 Initiate Bulk Transfer

`POST /transfer/bulk`

> **Requires the Transfers OTP requirement to be disabled.**

```json
{
  "currency": "NGN",
  "source": "balance",
  "transfers": [
    {
      "amount": 20000,
      "reference": "acv_2627bbfe-1a2a-4a1a-8d0e-9d2ee6c31496",
      "reason": "Bonus for the week",
      "recipient": "RCP_gd9vgag7n5lr5ix"
    },
    {
      "amount": 35000,
      "reference": "acv_1bd0c1f8-78c2-463b-8bd4-ed9eeb36be50",
      "reason": "Bonus for the week",
      "recipient": "RCP_zpk2tgagu6lgb4g"
    }
  ]
}
```

Response `data` is an array of `{ reference, recipient, amount, transfer_code, currency, status }`.

### 3.6 List / Fetch / Verify

| Action | Method & Path | Notes |
|---|---|---|
| List transfers | `GET /transfer` | Query: `perPage`, `page`, `recipient` (recipient **ID**), `from`, `to` |
| Fetch transfer | `GET /transfer/:id_or_code` | Transfer ID or `TRF_` code |
| Verify transfer | `GET /transfer/verify/:reference` | Look up by **your** reference. Response includes `status`, `fee_charged`, `gateway_response`, `failures`, and the full `recipient` object. |

---

## 4. Related Endpoints (listed in the API nav, not read in detail)

> These were seen in the API reference navigation but their individual pages were **not read**. Check the docs before relying on exact parameters or response shapes.

- **Check Balance:** `GET /balance`, under *Transfers Control* (https://paystack.com/docs/api/transfer-control/)
- **Resend / Disable / Enable Transfers OTP**, under *Transfers Control*
- **List Banks:** `GET /bank`, under *Miscellaneous* (https://paystack.com/docs/api/miscellaneous/)
- **Resolve Account Number:** `GET /bank/resolve?account_number=...&bank_code=...`, under *Verification* (https://paystack.com/docs/api/verification/). Use it to confirm the account name before paying.

---

## 5. Implementation (Next.js App Router, TypeScript)

### 5.1 Environment

`.env.local`
```bash
PAYSTACK_SECRET_KEY=sk_test_xxx
```

### 5.2 Paystack client helper

`lib/paystack.ts`
```ts
const BASE_URL = "https://api.paystack.co";

export async function paystack<T = any>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const json = await res.json();
  if (!res.ok || !json.status) {
    throw new Error(json.message || "Paystack request failed");
  }
  return json as T;
}
```

### 5.3 Create payout (recipient + transfer)

`app/api/payouts/route.ts`
```ts
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { paystack } from "@/lib/paystack";

export async function POST(req: Request) {
  // TODO: authenticate the user and verify they're allowed to withdraw
  // TODO: verify the amount against their balance in YOUR database

  const { accountNumber, bankCode, accountName, amountNaira, reason } =
    await req.json();

  if (!accountNumber || !bankCode || !accountName || !(amountNaira > 0)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    // 1. Create (or retrieve) the transfer recipient
    const recipient = await paystack("/transferrecipient", {
      method: "POST",
      body: {
        type: "nuban",
        name: accountName,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: "NGN",
      },
    });

    // 2. Initiate the transfer (amount in kobo)
    // 7 + 36 = 43 chars, lowercase/digits/dashes: valid reference format
    const reference = `payout-${randomUUID()}`;

    // TODO: persist { reference, userId, amount, status: "pending" } BEFORE calling Paystack

    const transfer = await paystack("/transfer", {
      method: "POST",
      body: {
        source: "balance",
        amount: Math.round(amountNaira * 100),
        recipient: recipient.data.recipient_code,
        reference,
        reason: reason ?? "Payout",
      },
    });

    return NextResponse.json({
      reference,
      transferCode: transfer.data.transfer_code,
      status: transfer.data.status, // "otp" => must finalize
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
```

### 5.4 Finalize (only if OTP is enabled)

`app/api/payouts/finalize/route.ts`
```ts
import { NextResponse } from "next/server";
import { paystack } from "@/lib/paystack";

export async function POST(req: Request) {
  const { transferCode, otp } = await req.json();

  try {
    const result = await paystack("/transfer/finalize_transfer", {
      method: "POST",
      body: { transfer_code: transferCode, otp },
    });
    return NextResponse.json(result.data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}
```

### 5.5 Check status

`app/api/payouts/[reference]/route.ts`
```ts
import { NextResponse } from "next/server";
import { paystack } from "@/lib/paystack";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ reference: string }> }
) {
  const { reference } = await params;
  try {
    const result = await paystack(`/transfer/verify/${reference}`);
    return NextResponse.json(result.data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
}
```

> On Next.js 14 and earlier, `params` is a plain object, not a Promise. Adjust accordingly.

---

## 6. Webhooks (final status)

Set up a webhook route to receive transfer outcomes. From general Paystack knowledge (**not verified in this research session; confirm at https://paystack.com/docs/payments/webhooks/**):

- Events: `transfer.success`, `transfer.failed`, `transfer.reversed`
- Verify the `x-paystack-signature` header: HMAC SHA512 of the **raw request body** using your secret key.
- Read the raw body with `await req.text()` (do not `req.json()` first) so the signature matches.
- Respond `200` quickly; process idempotently, since events can be delivered more than once.
- Match events to your DB records using `data.reference`.

Skeleton: `app/api/webhooks/paystack/route.ts`
```ts
import { NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: Request) {
  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  const expected = crypto
    .createHmac("sha512", process.env.PAYSTACK_SECRET_KEY!)
    .update(raw)
    .digest("hex");

  if (signature !== expected) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(raw);

  switch (event.event) {
    case "transfer.success":
      // mark payout (event.data.reference) as paid
      break;
    case "transfer.failed":
    case "transfer.reversed":
      // mark payout as failed; refund the user's balance in YOUR system
      break;
  }

  return NextResponse.json({ received: true });
}
```

---

## 7. Production Checklist

- [ ] **Authenticate and authorize** `/api/payouts`. Anyone who can call it can drain your balance.
- [ ] **Persist payouts before calling Paystack**, using the reference as an idempotency key. If a request times out, verify by reference instead of retrying with a new one.
- [ ] **Check your Paystack balance** (`GET /balance`) before initiating, and check the user's balance in your own DB.
- [ ] **Resolve the account name** (`GET /bank/resolve`) and show it to the user before paying.
- [ ] **Decide on OTP.** For programmatic payouts, you'll either handle the `otp` status via Finalize or disable the Transfers OTP requirement (mandatory for bulk transfers).
- [ ] **Handle webhooks** for the final state, including failures/reversals (restore the user's balance).
- [ ] **Keep the secret key server-side only**, and use different keys for test and live.
- [ ] **Rate limit** the payout endpoint, and log all Paystack responses (`message`, `data.status`, `failures`).
- [ ] **Validate amounts** server-side (positive integer in kobo, within limits).

---

## 8. Quick cURL Reference

```bash
# Create recipient
curl https://api.paystack.co/transferrecipient \
  -H "Authorization: Bearer $PAYSTACK_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type":"nuban","name":"Tolu Robert","account_number":"01000000010","bank_code":"058","currency":"NGN"}'

# Initiate transfer
curl https://api.paystack.co/transfer \
  -H "Authorization: Bearer $PAYSTACK_SECRET_KEY" \
  -H "Content-Type: application/json" \
  -d '{"source":"balance","amount":100000,"recipient":"RCP_xxx","reference":"payout-0001-aaaa-bbbb","reason":"Bonus"}'

# Verify transfer
curl https://api.paystack.co/transfer/verify/payout-0001-aaaa-bbbb \
  -H "Authorization: Bearer $PAYSTACK_SECRET_KEY"
```