# 推理数据面（实现备查）

> **产品主路线**见 [技术路线.md](技术路线.md)：Setup Token → Console API、Claude Code 原生 subagent、TCP → Console endpoint、0 提示词注入。
> 本文只记当前进程怎么挂。公开仓 **只走 rust cli-hop**。Go HTTP 转发不再启用。

Node 只做控制面（鉴权、协议、人设、调度、面板）。**不直连** `api.anthropic.com`。无直连回落，也无 Go hop 回落。

## 唯一推理路

`engine=rust`：envelope → Claude kernel → patched Claude Code `native_messages`（预开 20 slot）→ CLI TLS → 本机 HTTP CONNECT → 槽 SOCKS5 → Console / Anthropic。

```
client ──nginx──► Node :8787
                     │ fingerprint / persona / pool
                     └─ rust cli-hop
                           envelope → Claude kernel
                           provider=local_cli → Claude Code native_messages
                           CLI TLS → CONNECT → 槽 SOCKS5 → 上游
```

代码钉死：

- `resolveHopEngine` 永远返回 rust；缺二进制 / 不健康时 **blocked**，不切 Go。
- `resolveOfficialCcInference`：engine=rust 时 **强制** `cli-hop`。
- `writeKernelConfig`：`provider: local_cli`。
- 历史 `go` / `fallback_to_go` 写入一律收成 rust / false。
- Go hop 服务端已删除。`kin-worker` 只剩 `telemetry` 子命令。

## 不要和这两件事搞混

| 名字 | 是不是推理 |
|---|---|
| 官方 Claude Code **初装**（wipe → hello → /stats） | **不是**。换票后用槽内 cli-node 跑一次（不再另装官方 CLI）。推理不跑初装的常驻 CLI。 |
| kernel `HopClient` / `provider=anthropic_api` | **退役的 rust HTTP hop**。不要再当现网。 |
| `worker/` 凭证客户端 | 换票 / ensure 仍可能用到，**不**再做 `/v1/messages` hop。 |

## 槽位约束

- 强制槽 SOCKS5（`proxy_required=true`）。
- wrap 预开 20 native slot；面板「并行」只改 Node inflight，不重启 kernel。
- Extra 5h 以 Messages **headers** 为准。wrap 必须把 `anthropic-ratelimit-unified-5h-*` 从 CLI → kernel trailer → Node `ingestHeaders`。
