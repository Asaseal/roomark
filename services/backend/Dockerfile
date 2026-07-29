FROM rust:1.95-bookworm AS builder

WORKDIR /workspace
COPY proto ./proto
COPY services/backend ./services/backend
RUN cargo build --manifest-path services/backend/Cargo.toml --locked --release

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 roomark \
    && useradd --uid 10001 --gid roomark --no-create-home --shell /usr/sbin/nologin roomark \
    && mkdir -p /data \
    && chown roomark:roomark /data

COPY --from=builder /workspace/services/backend/target/release/roomark-backend /usr/local/bin/roomark-backend

ENV ROOMARK_HTTP_ADDR=0.0.0.0:8080 \
    ROOMARK_GRPC_ADDR=0.0.0.0:50051 \
    ROOMARK_DATABASE_URL=sqlite:///data/roomark.db?mode=rwc \
    RUST_LOG=roomark_backend=info,tower_http=info

USER roomark
VOLUME ["/data"]
EXPOSE 8080 50051
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["curl", "--fail", "--silent", "http://127.0.0.1:8080/health/ready"]

ENTRYPOINT ["/usr/local/bin/roomark-backend"]
