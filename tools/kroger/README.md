# Kroger OAuth — prove the flows before building anything

**Why this exists:** the cart specs declare **no `refreshUrl`**. Whether a cart token can be
refreshed — or whether a human must re-consent in a browser every hour — is the single biggest
unknown in the grocery-ordering work, and it decides whether the integration is viable. Prove it
here before writing integration code.

## 1. Register the app (only you can do this)

1. Go to **https://developer.kroger.com** and create an account.
2. Create an application. Note the **Client ID** and **Client Secret**.
3. Set the **Redirect URI** to exactly `http://localhost:8080/callback`
   (or set `KROGER_REDIRECT_URI` to whatever you registered — they must match **character for
   character**, or the exchange fails with a confusing error).
4. Request scopes: **`product.compact`** (search) and **`cart.basic:write`** (add to cart).
5. Note which **cart tier** you are granted — see "What to look for" below.

## 2. Run the flows

```bash
export KROGER_CLIENT_ID=...
export KROGER_CLIENT_SECRET=...

python3 kroger_auth.py client         # 1. easy flow — should print a token + expiry
python3 kroger_auth.py search milk    # 2. real search: UPCs, names, sizes, prices
python3 kroger_auth.py authorize      # 3. prints a URL — open it, log in, approve
python3 kroger_auth.py exchange CODE  # 4. paste the ?code= from the redirect URL
python3 kroger_auth.py refresh        # 5. THE IMPORTANT ONE
```

Step 3 redirects to `localhost:8080`, which will likely show a connection error — **that is fine**,
the code is in the browser's URL bar.

## What to look for

| Result | Meaning |
|---|---|
| `refresh` prints **REFRESH WORKS** | Viable. Store the refresh token; renew silently. |
| `exchange` says **NO REFRESH TOKEN** | Re-consent needed every ~`expires_in`. Design must change. |
| `refresh` prints `new refresh_token: yes (rotating)` | Must persist the new token each time or the next refresh fails. |
| `search` returns UPCs | Confirms `filter.term` works and gives real UPCs to check against Grocy barcodes. |

**Also verify:** that a UPC printed by `search` matches the barcode on the physical package. This
is assumed but unproven, and the whole Grocy→Kroger mapping depends on it.

## Cart tier

- **Public** (typical): one endpoint, `PUT /v1/cart/add`, returns 204. Add-only — **cannot list,
  amend, or delete** cart items.
- **Partner**: full cart control including `DELETE .../items/{upc}`.

This decides whether "we got chicken at Costco, drop it from the Kroger order" is possible via API
or only in the Kroger app.

## Safety

Nothing here writes to a cart — these commands only obtain and refresh tokens and read the product
catalog. The token files (`.kroger_client_token`, `.kroger_refresh_token`) are gitignored.
