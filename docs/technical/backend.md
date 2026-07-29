# Roomark 后端部署与运维

Roomark 后端为现有的扫描会话、房间模型、室内视角和家具布置数据提供可自托管存储。
Android 核心看房流程仍然本地优先，即使后端不可用也可以完成现场记录。

## 架构

一个 Rust 进程同时提供：

- REST：默认 `127.0.0.1:8080`，版本前缀 `/api/v1`
- gRPC：默认 `127.0.0.1:50051`，契约位于 `proto/roomark/v1/roomark.proto`
- SQLite：启动时自动执行向前迁移，使用外键、WAL 和事务
- 探针：`/health/live` 与 `/health/ready`
- API 说明：`/api/openapi.json` 与 `/docs`

REST 与 gRPC 共用应用服务和数据库，不存在两套业务状态。

## 本机运行

```powershell
cd services/backend
$env:ROOMARK_DATABASE_URL="sqlite://data/roomark.db?mode=rwc"
cargo run
```

如需关闭 gRPC：

```powershell
$env:ROOMARK_GRPC_ADDR="disabled"
cargo run
```

## Compose 部署

```powershell
Copy-Item .env.example .env
docker compose up --build -d backend
docker compose ps
Invoke-RestMethod http://127.0.0.1:8080/health/ready
```

`roomark-data` 命名卷保存 `/data/roomark.db`。默认只绑定本机地址。若要通过反向代理提供服务，
应启用 HTTPS，在 `.env` 中设置至少 16 个字符的 `ROOMARK_API_KEY`，并配置明确的
`ROOMARK_CORS_ORIGINS`。

数据接口使用：

```text
Authorization: Bearer <ROOMARK_API_KEY>
```

健康检查与 API 说明不要求密钥。

## 备份

为了获得一致的 SQLite 冷备份，先停止写入：

```powershell
docker compose stop backend
docker run --rm `
  -v roomark_roomark-data:/data:ro `
  -v ${PWD}\backups:/backup `
  alpine:3.22 `
  sh -c "cp /data/roomark.db /backup/roomark-`$(date +%Y%m%d-%H%M%S).db"
docker compose start backend
Invoke-RestMethod http://127.0.0.1:8080/health/ready
```

备份文件应保存到受访问控制的位置，并额外计算 SHA-256。

## 恢复

恢复会替换当前数据，执行前先保留现有数据库：

```powershell
docker compose stop backend
docker run --rm `
  -v roomark_roomark-data:/data `
  -v ${PWD}\backups:/backup:ro `
  alpine:3.22 `
  sh -c "cp /backup/roomark-YYYYMMDD-HHMMSS.db /data/roomark.db && rm -f /data/roomark.db-shm /data/roomark.db-wal"
docker compose start backend
Invoke-RestMethod http://127.0.0.1:8080/health/ready
```

## 升级

1. 创建一致备份。
2. 拉取明确的提交或版本标签。
3. 运行 `docker compose build backend`。
4. 运行 `docker compose up -d backend`。
5. 检查 `/health/ready`、日志和关键 API 流程。

数据库迁移在进程启动时自动执行。迁移只向前运行；回滚应用版本前必须确认旧版本可以读取升级后的
数据库，否则使用备份恢复。

## 故障排查

- `/health/live` 成功但 `/health/ready` 失败：检查数据卷权限、磁盘空间和 SQLite 文件。
- 返回 `401`：确认 Bearer 密钥与 `ROOMARK_API_KEY` 完全一致。
- 返回 `413`：请求超过 1 MiB；房间二进制应进入独立对象存储，不应作为 API JSON 上传。
- 返回 `409`：同一扫描会话已用不同幂等键完成；客户端应复用原 `Idempotency-Key`。
- 启动失败：检查监听端口、SQLite URL、CORS 来源格式和 API Key 长度。
