# EduSSO v1 — Reference Examples

A minimal end-to-end implementation of EduSSO v1, in three pieces:

| Folder | Role | Stack |
|---|---|---|
| [`school-issuer/`](./school-issuer/) | Issuer | Node + Express + jose. ~80 lines. Mints JWTs, serves JWKS. |
| [`school-host/`](./school-host/) | Launcher | Electron. Shows the student and an app catalog; opens each app with a fresh `?edu_session=` token. |
| [`example-tutor/`](./example-tutor/) | Tutor (relying party) | Node + Express + jose. ~50 lines. Verifies the token, sets a cookie, displays the email. |

This is the smallest setup that exercises the whole protocol. The student is hardcoded as `alice@example.com`; one tutor (`example-tutor`) is registered with the issuer.

## Running it

Open three terminals.

```bash
# Terminal 1 — issuer (http://localhost:4000)
cd school-issuer
npm install
npm start

# Terminal 2 — tutor (http://localhost:5000)
cd example-tutor
npm install
npm start

# Terminal 3 — launcher (Electron)
cd school-host
npm install
npm start
```

Then in the school-host window: click **Example Tutor**. You should see "Hello, Alice" inside the tutor view, with the email rendered and a logout button. No login form was shown — the launcher minted a token, the tutor verified it, and the cookie is set.

## What to inspect

- **Issuer JWKS**: `curl http://localhost:4000/.well-known/jwks.json`
- **Minting a token by hand**:
  ```bash
  curl -X POST http://localhost:4000/token \
    -H "Authorization: Bearer dev-launcher-token" \
    -H "Content-Type: application/json" \
    -d '{"child_id":"student-1","audience":"example-tutor"}'
  ```
- **Verifying without the host**: paste the token returned above into `http://localhost:5000/?edu_session=<token>` in a regular browser and you should be logged in.

## What this example does NOT show

- Key rotation (one key is generated on first run and reused).
- Multi-launcher dispatch (one issuer, one audience).
- Local durability or retry on the host side (a single fetch per open).
- Production-grade auth on the issuer's mint endpoint (a hardcoded bearer).
- Cookie partitions across multiple tutors (only one tutor is registered).

The intent is clarity over completeness. Pair the code with [`../protocol.md`](../protocol.md), [`../issuer.md`](../issuer.md), and [`../tutor.md`](../tutor.md) for the normative behavior.
