# example-tutor

EduSSO v1 reference tutor (relying party). About fifty lines of meaningful code; the rest is HTML and ergonomics.

The whole protocol integration is the `eduSSO` middleware in `index.js`.

## Run

```bash
npm install
npm start
```

By default listens on `http://localhost:5050` and verifies tokens against the issuer at `http://localhost:4000`.

Environment variables:

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `5050` | HTTP port (5000 is taken by AirPlay Receiver on macOS) |
| `ISSUER_URL` | `http://localhost:4000` | Where to fetch the JWKS |
| `AUDIENCE` | `example-tutor` | The `aud` claim to verify against |

## How it works

1. A request to `/` comes in.
2. If `?edu_session=<jwt>` is present, the middleware verifies it (signature, `iss`, `aud`, `exp`, `iat`, `email_verified`).
3. On success it drops a `tutor_session` cookie carrying `{ email, name }` and redirects to `/` with the query parameter stripped.
4. On failure (or no token) the request falls through; the page either shows the logged-in view or a "no session" stub.

## Try it without the host

Mint a token by hand against the issuer (`Authorization: Bearer dev-launcher-token`):

```bash
TOKEN=$(curl -sX POST http://localhost:4000/token \
  -H "Authorization: Bearer dev-launcher-token" \
  -H "Content-Type: application/json" \
  -d '{"child_id":"student-1","audience":"example-tutor"}' | jq -r .token)

open "http://localhost:5050/?edu_session=$TOKEN"
```

You should land on the logged-in view with `alice@example.com`.
