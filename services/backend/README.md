# Roomark Backend

Roomark Backend is the self-hostable persistence and interoperability service for the existing
scan, room, indoor-tour, and furnishing domains. The Android app remains local-first and does not
require this service for its core field workflow.

## What it provides

- Versioned REST API at `/api/v1`
- Standard gRPC API generated from `proto/roomark/v1/roomark.proto`
- SQLite persistence with foreign keys, WAL mode, migrations, and transactional replacements
- Liveness and readiness endpoints
- Optional Bearer API-key protection for data routes
- Request IDs, structured HTTP traces, size limits, timeouts, and configurable CORS
- Reproducible non-root container and Compose deployment

The service does not store uploaded room binaries. `sourceAssetName` and `previewModelUrl` are
metadata references; operators choose and secure object storage separately.

## Native development

```powershell
cd services/backend
$env:ROOMARK_DATABASE_URL="sqlite://data/roomark.db?mode=rwc"
cargo run
```

The default listeners are `127.0.0.1:8080` for REST and `127.0.0.1:50051` for gRPC.

```powershell
Invoke-RestMethod http://127.0.0.1:8080/health/ready
```

API metadata is available at:

- `http://127.0.0.1:8080/api/openapi.json`
- `http://127.0.0.1:8080/docs`

## Verification

```powershell
cargo fmt --check
cargo clippy --all-targets --locked -- -D warnings
cargo test --locked
```

## Container

From the repository root:

```powershell
Copy-Item .env.example .env
docker compose up --build -d backend
Invoke-RestMethod http://127.0.0.1:8080/health/ready
```

Set a strong `ROOMARK_API_KEY` in `.env` before exposing the service beyond a trusted local
network. The Compose file binds REST and gRPC to localhost by default.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `ROOMARK_HTTP_ADDR` | `127.0.0.1:8080` | REST listener |
| `ROOMARK_GRPC_ADDR` | `127.0.0.1:50051` | gRPC listener; use `disabled` to turn it off |
| `ROOMARK_DATABASE_URL` | `sqlite://data/roomark.db?mode=rwc` | SQLite file URL |
| `ROOMARK_CORS_ORIGINS` | empty | Comma-separated HTTP(S) origins |
| `ROOMARK_API_KEY` | empty | Optional Bearer key, at least 16 characters |
| `RUST_LOG` | service defaults | Rust tracing filter |

See `docs/technical/backend.md` for deployment, backup, restore, and upgrade operations.
