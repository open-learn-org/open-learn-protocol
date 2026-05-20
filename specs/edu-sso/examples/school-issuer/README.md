# school-issuer

EduSSO v1 reference issuer. Generates an RS256 keypair on first run (stored in `keys.json`, gitignored), serves the public key as JWKS, and mints audience-bound JWTs on demand.

## Run

```bash
npm install
npm start
```

By default listens on `http://localhost:4000`.

Environment variables:

| Var | Default | Meaning |
|---|---|---|
| `PORT` | `4000` | HTTP port |
| `ISSUER_URL` | `http://localhost:${PORT}` | The `iss` claim of minted tokens |
| `LAUNCHER_TOKEN` | `dev-launcher-token` | Bearer that authorizes `/token` |

## Endpoints

### `GET /.well-known/jwks.json`

Returns the public JWKS for verifiers.

### `POST /token`

Mint a JWT.

Headers: `Authorization: Bearer <LAUNCHER_TOKEN>`, `Content-Type: application/json`.

Body:
```json
{ "child_id": "student-1", "audience": "example-tutor" }
```

Response:
```json
{ "token": "eyJ...", "expires_in": 300 }
```

## Hardcoded data

- One child: `student-1` → `alice@example.com` (name: Alice).
- One audience: `example-tutor`.
- One launcher credential: `dev-launcher-token` (override via env).
