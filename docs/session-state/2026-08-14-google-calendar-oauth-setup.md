# Google Calendar OAuth — what worked, and the traps

**Done 2026-08-14 on the dev rig.** Read + write both verified. Repeat this on the Pi.

## Outcome

| | |
|---|---|
| Account | `garrettdehart@gmail.com` (NOT `garebecca@gmail.com` — see §1) |
| Entity | **`calendar.family`** — matches the pre-existing placeholder exactly |
| Read | ✅ events read back via `/api/calendars/calendar.family` |
| Write | ✅ `calendar.create_event` → 200, event read back |
| Dashboard | Calendar view (month grid): `calendar.family` + US holidays |
| Publishing status | **In production** (see §4) |

Because write works, `KitchenAddCalendarEvent` in `homeassistant/packages/calendar.yaml`
is live — it was written months ago and had never had a writable calendar.

## 1. Why the calendar moved accounts

The original shared calendar was the **primary** calendar of `garebecca@gmail.com`. Primary
calendars expose **no iCal address** — the "Integrate calendar" section shows only Calendar ID,
Public URL, and Embed code. So there was no ICS feed to point HA at, and the public feed 404s:

```bash
curl -sL -o /dev/null -w "%{http_code}\n" \
  "https://calendar.google.com/calendar/ical/garebecca%40gmail.com/public/basic.ics"   # 404
```

**Secondary** calendars (`...@group.calendar.google.com`) DO expose a secret iCal address. A new
"Family" calendar was created under `garrettdehart@gmail.com` instead. Since that account was
already the one in use, full OAuth was chosen over the ICS feed — it gives write access, which
ICS cannot.

## 2. Google Cloud Console

1. Create project (`KitchenCOM`)
2. **Enable the Calendar API** — https://console.cloud.google.com/apis/library/calendar-json.googleapis.com
   Skipping this fails *after* consent, which is a confusing place to fail.
3. **Audience** → **External** (Internal is greyed out on personal Gmail — no Workspace org.
   This is expected, not an error.) Add your own Gmail as a **test user**.
4. **Clients** → **+ CREATE CLIENT** → **Web application**
   Authorized redirect URIs — add **both**:
   ```
   https://my.home-assistant.io/redirect/oauth
   http://localhost:8124/auth/external/callback
   ```
   The console calls this **Google Auth Platform → Clients**; the old name was
   "APIs & Services → Credentials". Direct link: https://console.cloud.google.com/apis/credentials

## 3. ⚠️ The redirect trap — cost the most time

The callback kept landing on `http://homeassistant.local:8123`, which does not exist on the Mac
(`DNS_PROBE_FINISHED_NXDOMAIN`). **Three separate places must agree on HA's address**, and they
are stored in three different systems:

1. **HA's own config** (`.storage/core.config`) — `internal_url`/`external_url` were **both
   `None`**. Set them to `http://localhost:8124`.
2. **Google's registered redirect URIs** — see §2.
3. **`my.home-assistant.io`'s instance URL** — ⚠️ **stored in YOUR BROWSER's local storage**,
   not in HA. This is the one that is invisible from the server side. On the
   "Link account to Home Assistant?" page there is a line reading
   *"Your instance URL: http://homeassistant.local:8123"* with a **✏️ pencil**. Click it and set
   `http://localhost:8124` **before** clicking "Link account".

Diagnostic that proves how far the flow got: if the failed URL contains `code=4/0A...`, **Google
already approved** — only the handoff back to HA failed. Decode the `state` JWT payload to see
which `redirect_uri` HA recorded.

**On the Pi this recurs** with the Pi's own address. Same three places.

## 4. Publishing status — do not skip

The app starts in **Testing**, where refresh tokens **expire after 7 days** and the calendar
silently stops updating. Fix: https://console.cloud.google.com/auth/audience → **PUBLISH APP**
→ Confirm. Status becomes **In production**; tokens stop expiring. **Done 2026-08-14.**

Verification warnings can be ignored — verification only matters for letting strangers use the
app. Personal use stays unverified forever; the only symptom is the
"Google hasn't verified this app" screen (**Advanced → Go to KitchenCOM (unsafe)**).

## 5. ⚠️ Self-inflicted: recovery mode from a bad YAML edit

Mid-session a `str.replace("default_config:", ...)` matched `default_config:` **inside a comment**
in `dev-config/configuration.yaml`, splitting it across a newline and leaving a stray backtick on
line 6. HA refused to boot:

```
ERROR [homeassistant.bootstrap] Failed to parse configuration.yaml: while scanning
for the next token in "/config/configuration.yaml", line 6, column 1. Activating recovery mode
```

Two lessons:
- **`dev-config/configuration.yaml` is a GENERATED COPY.** The canonical file is
  `deploy/homeassistant/dev-configuration.yaml`. Edit the canonical one.
- Never blind-replace a YAML key that also appears in prose. Verify after any edit:
  ```bash
  diff deploy/homeassistant/dev-configuration.yaml \
       deploy/homeassistant/dev-config/configuration.yaml   # expect identical
  ```

Recovery mode did its job — it refused a broken config rather than half-booting. Nothing was lost;
OAuth tokens live in `.storage` and were untouched.

## 6. Carry-forwards

- **Rotate the client secret.** It was captured in a screenshot during setup and is in the session
  transcript. Low severity (access is still restricted to the test-user list), but rotate it:
  Google Auth Platform → Clients → add a new secret → update in HA → delete the old one.
- **`calendar.family` is nearly empty** — only the "KitchenCOM test event" that proved the write
  path. Delete it and add real events before the panel is on display.
- **Other calendars are available** if the family already uses one: `calendar.deharts`,
  `calendar.bec_gare`, `calendar.rebdinatl_gmail_com`, `calendar.garrett_dehart`. Adding one is a
  one-line dashboard change now that OAuth works.
