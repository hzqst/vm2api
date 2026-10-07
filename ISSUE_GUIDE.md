# Issue 提交指南

提交前按本页收集信息，再用 [Bug 报告表单](https://github.com/dofastted/vm2api/issues/new?template=bug_report.yml) 提交。信息齐全的 Issue 可以直接复现定位；缺版本、缺日志的 Issue 只能先回问。

<p align="center">
  <img src="docs/images/issue-flow.svg" alt="vm2api Issue 提交路线图" width="100%" />
</p>

> [!WARNING]
> Issue 是公开的。贴出任何内容前先按 [§6 脱敏](#6-脱敏必做) 处理：API Key、OAuth / setup-token、sessionKey、Cookie、代理账号密码、面板密码、公网 IP 一律打码。泄露的凭证要立即作废重建。

---

## 0. 提交前自查

- [ ] 已升级到 [最新 Release](https://github.com/dofastted/vm2api/releases)，问题仍存在（升级：`curl -sSL https://raw.githubusercontent.com/dofastted/vm2api/main/deploy/install.sh | sudo bash -s -- upgrade`）
- [ ] 已在 [Issues](https://github.com/dofastted/vm2api/issues?q=is%3Aissue) 搜索过错误码 / 关键字，没有重复
- [ ] 已对照 [CHANGELOG.md](CHANGELOG.md)，不是已知行为变更
- [ ] 一个 Issue 只写一个问题；多个问题分开提

功能建议走 [功能建议表单](https://github.com/dofastted/vm2api/issues/new?template=feature_request.yml)；使用交流走 [Telegram @VM2API](https://t.me/VM2API)。安全漏洞**不要**公开提 Issue，私信 Telegram 联系作者。

---

## 1. 使用的版本（必填）

```bash
cat /opt/vm2api/VERSION                                      # 控制面版本，例如 1.3.102
docker inspect vm2api --format '{{.Config.Image}}'           # 镜像与 tag
curl -sSL https://raw.githubusercontent.com/dofastted/vm2api/main/deploy/install.sh | sudo bash -s -- status
```

管理台 `设置 → 关于` 也能看到当前版本。同时说明：

- 部署方式：一键脚本 / 手动 Docker Compose / `--from-source` 源码构建 / systemd 本机运行
- 是否为升级后出现：写明 **升级前版本 → 升级后版本**。能确认“上一个版本正常”的回归问题定位最快。

## 2. 可复现路线（必填）

写成别人照做就能复现的步骤，而不是结论：

1. 前置状态：几个 VM、什么账号类型、是否开了 KVM、绑定了什么代理
2. 操作：在管理台点了什么 / 发了什么请求（附 **最小化** 的 curl，模型、`stream`、`tools` 照实写）
3. 期望结果
4. 实际结果：HTTP 状态码、错误 `code`、界面提示原文
5. 频率：必现 / 偶发（大约几次中出现一次）/ 只出现过一次

最小 curl 示例（替换密钥，保留出问题的参数）：

```bash
curl -sS -D - http://127.0.0.1:8787/v1/messages \
  -H "Authorization: Bearer $VM2API_API_KEY" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-5-5","max_tokens":1024,"stream":false,"messages":[{"role":"user","content":"hello"}]}'
```

`-D -` 会打印响应头，其中的 `x-request-id` 是第 4 步查请求日志用的。

## 3. 使用的环境（必填）

### 3.1 VPS / 宿主机

| 项 | 示例 |
|---|---|
| 云厂商 / 机房地区 | 例如 Hetzner 德国、本地物理机。不要填写公网 IP |
| 规格 | 8C / 16G / 200G NVMe |
| 系统 | Ubuntu 24.04 LTS，内核 6.8 |
| 虚拟化 | KVM 母机 / OpenVZ / LXC / 物理机；`/dev/kvm` 是否存在 |
| Docker | 版本号；是否 rootless |
| 槽位运行时 | Docker 容器 / KVM-QEMU 虚拟机 |
| 规模 | VM 数量；是否多 VPS 集群节点 |

一键收集（只读，不含密钥；端口不是 8787 时自行修改）：

```bash
cd /opt/vm2api
echo "== version";  cat VERSION
echo "== image";    docker inspect vm2api --format '{{.Config.Image}}' 2>/dev/null
echo "== health";   curl -sS --noproxy '*' http://127.0.0.1:8787/health | head -c 3000; echo
echo "== os";       . /etc/os-release && echo "$PRETTY_NAME"; uname -r
echo "== virt";     systemd-detect-virt 2>/dev/null; ls -l /dev/kvm 2>/dev/null || echo "no /dev/kvm"
echo "== cpu/mem";  nproc; free -h | sed -n 2p
echo "== disk";     df -h /opt | tail -n 1
echo "== docker";   docker version --format '{{.Server.Version}}'
echo "== slots";    docker ps -a --filter name=kin- --format '{{.Names}}\t{{.Status}}\t{{.Image}}'
```

### 3.2 代理 / 出口

vm2api 是 **1 VM = 1 出口**，代理问题占了大量故障。请写清：

| 项 | 示例 |
|---|---|
| 出口方式 | 独立 SOCKS5 / 本机直连（local） / 其他 |
| 代理类型 | 住宅 / ISP 静态 / 机房 IP；动态还是静态 |
| 出口地区 | 美国 / 日本 / …（只写国家或州，不写完整 IP） |
| 是否共享 | 同一出口是否被多个 VM 或其他程序共用 |
| DoH | 是否配置自定义 DoH |
| 宿主机代理 | 宿主机是否设置了 `HTTP(S)_PROXY` / 透明代理 |

出口自测（**贴结果前删掉账号密码和 IP 后两段**）：

```bash
curl -sS -x socks5h://USER:PASS@HOST:PORT https://ipinfo.io/json
```

### 3.3 账号与客户端

- 账号类型：Claude Pro / Max / Team / Enterprise、ChatGPT（Codex）
- 凭证方式：OAuth / setup-token / sessionKey 导入 / API Key
- 客户端：Claude Code、Cursor、Cherry Studio、Open WebUI、自写脚本…，以及调用的入口 `/v1/messages`、`/v1/chat/completions`、`/v1/responses`

## 4. 日志（必填其一，越全越好）

### 4.1 VM 创建 / 启动日志

VM 创建、导入、启动、重置失败时提供：

1. 管理台报错原文；或浏览器 DevTools → Network 中 `/api/panel/vms/create`（或对应接口）的响应体，含 `error.code` 与 `message`
2. 控制面日志：

   ```bash
   docker logs --since 30m --timestamps vm2api 2>&1 | tail -n 300 > vm2api.log
   ```

3. 槽位容器日志（`vm-01` 对应容器 `kin-01`，以此类推）：

   ```bash
   docker logs --since 30m --timestamps kin-01 2>&1 | tail -n 300 > kin-01.log
   ```

4. 槽位健康：管理台 → 虚拟机 → 详情中的内核状态；或 `GET /api/panel/vms/vm-01` 返回的 `kernel.rust_health`

### 4.2 请求日志

请求失败、流中断、`incomplete_response`、429、拒答等推理问题提供：

1. 响应头 `x-request-id`（或管理台 → 日志 中对应行的 request id）
2. 该请求的 attempts：每次选中的 VM / 账号、错误域、cooldown、提交边界、终态。管理台 → 日志 → 点开请求即可看到；也可以用 Master Key 拉取：

   ```bash
   curl -sS http://127.0.0.1:8787/api/panel/request-logs/<request_id>/attempts \
     -H "Authorization: Bearer $VM2API_API_KEY"
   ```

3. 需要请求体时，对单个复现请求加头 `X-Kin-Debug: 1`（落库为脱敏 body）。debug body 含你的提示词内容，贴出前自己检查。
4. 同一时间段的 `vm2api.log` / `kin-NN.log`（见 4.1），时间点要与请求对得上

日志太长请作为附件（`.log` / `.txt`）上传，不要只贴一行报错。

## 5. 源码定位（可选）

如果你读过代码，欢迎附上：

- 可疑位置的 permalink（GitHub 文件页按 `y` 得到带 commit 的固定链接），例如 `src/lib/vm/provisioning.mjs#L120-L140`
- 你认为的原因与依据，或已验证有效的最小改动
- 想直接修复的话，先在 Issue 里说明思路，再提 PR 并关联本 Issue

## 6. 脱敏（必做）

| 必须打码 | 出现位置 |
|---|---|
| `VM2API_API_KEY`、子密钥、`VM2API_DB_SECRET` | `.env`、curl 命令、请求头 |
| OAuth access / refresh token、setup-token、`sk-ant-…` | 日志、`vms/*.json`、面板接口响应 |
| sessionKey、Cookie、`kin_panel_token` | 导入记录、浏览器请求 |
| 代理 `USER:PASS`、完整出口 IP、宿主机公网 IP / 域名 | 代理配置、日志 |
| 账号邮箱 | 面板、日志 |

- 不要整份上传 `.env`、`vms/*.json`、`data/` 下的数据库
- 用固定占位符替换，例如 `sk-ant-***`、`1.2.*.*`，保留格式便于判断
- 上传前自查：

  ```bash
  grep -nEi 'sk-ant|sessionkey|bearer [a-z0-9]|password|refresh_token|socks5h?://[^ ]*@' *.log
  ```

## 7. 提交与跟进

1. 打开 [New issue](https://github.com/dofastted/vm2api/issues/new/choose) → **Bug 报告**，按表单逐项填写
2. 标题格式：`[Bug] <现象> (<版本>)`，例如 `[Bug] 创建 KVM 槽位卡在 provisioning (1.3.102)`
3. 维护者回问时请在同一 Issue 补充，不要另开新 Issue
4. 修复会在 [CHANGELOG.md](CHANGELOG.md) 与 Release 中注明；升级验证后请回复结果并关闭

---

## 附：一个合格 Issue 的样子

```text
[Bug] /v1/messages 流式请求偶发 502 incomplete_response (1.3.102)

版本：1.3.102，一键脚本安装，从 1.3.100 升级后出现
复现：Claude Code 连续对话 20 轮，约 1/10 请求在 ~90s 时断流
期望：完整收到 message_stop
实际：502 incomplete_response，x-request-id = 9f3c…
环境：Hetzner DE 8C16G Ubuntu 24.04，KVM 母机，3 个 Docker 槽位
代理：每 VM 独立 SOCKS5，ISP 静态，美国，不共享
日志：附 attempts.json、vm2api.log、kin-02.log（已脱敏，时间 14:02–14:05 UTC）
源码：无
```
