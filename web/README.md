# vm2api 管理台

Vite + React。开发：

```bash
VM2API_API_PROXY=http://127.0.0.1:8787 pnpm dev
```

路由是 hash：`#/overview`、`#/database`、`#/users`、`#/settings/backup`。构建：`pnpm build` → `web/dist`，控制面 `GET /console` 提供。
