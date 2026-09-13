# 正式服务器部署与数据恢复手册

> 2026-09-06 已部署的服务器内测使用现有 Nginx、`/welcomeparty/` 子路径和全新合成数据库；准确路径、服务及回退方式见 [`INTERNAL_SERVER_HANDOFF.md`](./INTERNAL_SERVER_HANDOFF.md)。本文件继续作为正式受保护名单部署的参考，不能照搬这里的根路径/Caddy 示例覆盖当前其他项目。

> 状态：D-056 仓库内基线已实现并通过本机自动门；实际服务器、DNS、证书、私密数据传输和现场链路仍须按本文执行与签核。本文以支持 systemd 的单台 Linux 主机为参考，不构成已经上线的声明。

## 1. 架构与不可跨越的边界

```text
手机 / 后台 / OBS
        │ HTTPS + WSS
        ▼
   Caddy :443 ───── 静态提供 frontend/dist
        │ /api、/ws
        ▼
Node/Fastify 127.0.0.1:3000（严格单实例）
        │
        ▼
/var/lib/sysu-welcome/private（0700，代码目录之外）
  ├─ 2026-roster.sqlite（0600）
  ├─ 2026-runtime-secret.json（0600）
  └─ 2026-nfc-map.csv（0600）
```

- GitHub 只承载代码、迁移、测试、合成排练和部署模板；正式 SQLite、运行凭据、NFC 映射、备份包及任何名单导出都不得提交。
- 正式数据通过获批准的加密通道单独传到服务器，落地后只归 `sysu-welcome` 服务账号访问；不得经聊天、普通网盘、Issue 或 PR 传递。
- 当前 SQLite 架构只允许一个后端写实例。禁止负载均衡多个 Node 实例、把数据库放到 NFS/SMB/同步盘，或让两个 release 同时连接同一库。需要高可用或多机扩展时先迁移到经过独立评审的服务端数据库。
- Caddy 负责公网 HTTPS/WSS 与静态文件，后端只监听 loopback。Caddy 可自动管理证书和 WebSocket 代理，配置依据见 [Automatic HTTPS](https://caddyserver.com/docs/automatic-https) 与 [reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)。

## 2. 仓库中的部署资产

| 文件 / 命令 | 用途 |
|---|---|
| `deploy/Caddyfile` | HTTPS、静态 SPA、`/api`/`/ws` 反代及基础安全响应头 |
| `deploy/sysu-welcome.service` | 单实例 systemd 守护、失败重启和文件系统收紧 |
| `deploy/runtime.env.example` | 正式后端非秘密配置模板 |
| `deploy/caddy.env.example` | 域名与证书联系邮箱模板 |
| `deploy/caddy-sysu-welcome.conf` | Caddy systemd drop-in，用于加载域名变量 |
| `pnpm deploy:check` | 静态检查模板、启动脚本、忽略规则与安全开关 |
| `pnpm test:formal:smoke` | 使用临时合成 `PROTECTED` 数据验证生产启动、loopback API 与 Secure Cookie |
| `pnpm test:rehearsal:smoke` | 使用全新临时目录验证协作排练的首次 v1→v2 初始化与三端启动 |

生产启动器 `pnpm start:formal` 会在监听前执行编译后的 v2 完整验证，并逐行核对 NFC 映射中的序号、姓名、学号 HMAC、随机邀请令牌摘要、公开星号和正式 HTTPS origin。它拒绝以下情况：私密文件缺失/为空/互相重名或互不匹配、运行凭据不是 `PROTECTED_ROSTER`、数据位于代码仓库内、目录或文件权限过宽、NFC 仍是相对地址或域名不一致、origin 不是纯 HTTPS origin、后端不是 loopback、Cookie/代理安全开关冲突，或正式构建缺失。错误只报告类别，不回显映射行。`trustProxy` 只接受 `127.0.0.1` 与 `::1`；这遵守 Fastify 对受信代理配置的安全边界，参见 [Fastify Server: trustProxy](https://fastify.dev/docs/latest/Reference/Server/#trustproxy)。

## 3. 首次部署

### 3.1 前置条件

1. 准备唯一正式域名并把 DNS 指向目标主机；确认 80/443 可供 Caddy 完成证书签发与续期。
2. 安装仓库声明兼容的 Node.js、corepack/pnpm 与 Caddy；确认 `/usr/bin/node` 是实际 Node 路径，否则同步修改 service 的 `ExecStart`。
3. 创建无登录服务账号与目录：

```bash
sudo useradd --system --home /var/lib/sysu-welcome --shell /usr/sbin/nologin sysu-welcome
sudo install -d -o root -g root -m 0755 /opt/sysu-welcome/releases
sudo install -d -o sysu-welcome -g sysu-welcome -m 0700 /var/lib/sysu-welcome/private
sudo install -d -o root -g root -m 0755 /etc/sysu-welcome
```

### 3.2 构建不可变 release

把指定 Git 提交检出到 `/opt/sysu-welcome/releases/<commit-sha>`，记录完整 SHA，然后以该目录为当前工作目录执行：

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm deploy:check
pnpm test:formal:smoke
pnpm test:rehearsal:smoke
pnpm build:formal
```

`test:formal:smoke` 只创建并清理 OS 临时合成资产，不读取正式目录。构建通过后再原子更新只读代码入口：

```bash
sudo ln -sfn /opt/sysu-welcome/releases/<commit-sha> /opt/sysu-welcome/current
```

### 3.3 传输并恢复私密数据

先在当前持有正式库的受控机器上，用最终无路径 HTTPS origin 生成一份**新的**定稿映射；不要覆盖原相对映射：

```powershell
pnpm db:nfc:finalize -- --input 'backend/.private/2026-nfc-map.csv' `
  --output 'backend/.private/2026-nfc-map-final.csv' `
  --public-origin 'https://welcome.example.edu.cn'
```

然后从仓库根目录创建一个全新、仓库外备份目录，`--nfc-map` 必须指向这份定稿映射：

```powershell
pnpm db:formal:backup -- --database 'backend/.private/2026-roster.sqlite' `
  --secret 'backend/.private/2026-runtime-secret.json' `
  --nfc-map 'backend/.private/2026-nfc-map-final.csv' `
  --output-dir 'D:\ProtectedBackups\sysu-welcome-<timestamp>' `
  --confirm CREATE_VERIFIED_PROTECTED_BACKUP
```

该命令使用 `better-sqlite3` 的在线 backup API 取得一致快照，再把备份副本收敛为无 `-wal/-shm` 依赖的单文件 SQLite，连同两项配套资产生成 SHA-256 manifest，并逐行核对 NFC 映射与受保护目录后复验；API 语义见 [better-sqlite3 backup](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#backupdestination-options---promise)。备份可以在服务运行时创建，但建议避开现场高峰并确认磁盘空间。生产启动还会把映射中的 HTTPS origin 与 `FORMAL_PUBLIC_ORIGIN` 做精确匹配。

备份目录本身含明文受保护数据。先使用组织批准的加密封装和传输通道，再传到服务器受控暂存区；不要把密钥与密文放在同一通道。随后在目标 release 中恢复到一个**尚不存在**的新目录：

```bash
node backend/dist/cli/formal-restore.js \
  --bundle-dir /受控暂存/已解密备份目录 \
  --output-dir /var/lib/sysu-welcome/private-next \
  --confirm MATERIALIZE_VERIFIED_PROTECTED_BACKUP
sudo chown -R sysu-welcome:sysu-welcome /var/lib/sysu-welcome/private-next
sudo chmod 0700 /var/lib/sysu-welcome/private-next
sudo chmod 0600 /var/lib/sysu-welcome/private-next/*
```

恢复器先验证 manifest、每个文件的长度/SHA-256、SQLite `integrity_check`、协议 v2、schema、人数和 `PROTECTED` 分类，然后才写全新目录；目标存在或位于 Git 仓库内时会拒绝。验证通过后把该目录作为 `FORMAL_RUNTIME_DIR`。不要直接复制正在写入的 `.sqlite`，也不要手工搬运或拼接 `-wal/-shm`。

### 3.4 安装环境、systemd 与 Caddy

从模板复制后只替换实际域名、邮箱和运行目录：

```bash
sudo install -o root -g root -m 0600 deploy/runtime.env.example /etc/sysu-welcome/runtime.env
sudo install -o root -g root -m 0644 deploy/sysu-welcome.service /etc/systemd/system/sysu-welcome.service
sudo install -o root -g root -m 0600 deploy/caddy.env.example /etc/sysu-welcome/caddy.env
sudo install -d -o root -g root -m 0755 /etc/systemd/system/caddy.service.d
sudo install -o root -g root -m 0644 deploy/caddy-sysu-welcome.conf /etc/systemd/system/caddy.service.d/sysu-welcome.conf
sudo install -o root -g root -m 0644 deploy/Caddyfile /etc/caddy/Caddyfile
```

必须把 `/etc/sysu-welcome/runtime.env` 中的 `FORMAL_RUNTIME_DIR` 和 `FORMAL_PUBLIC_ORIGIN` 改为实际值；origin 只能是 `https://域名`，不能含路径、查询或片段。`DEMO_SECURE_COOKIES=1`、`DEMO_TRUST_LOOPBACK_PROXY=1` 与 `DEMO_BACKEND_HOST=127.0.0.1` 不得关闭。正式 NFC 完整 URL 必须使用同一 origin。

先验证再启动：

```bash
pnpm deploy:check
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl daemon-reload
sudo systemctl enable --now sysu-welcome
sudo systemctl enable --now caddy
sudo systemctl --no-pager --full status sysu-welcome caddy
```

## 4. 上线检查单

- [ ] 记录部署提交完整 SHA，release 工作树无私密文件，`pnpm deploy:check`、两项 smoke 与适用回归门通过。
- [ ] `caddy validate`、`systemctl status` 与重启后自动恢复通过；系统中只有一个后端进程监听 `127.0.0.1:3000`。
- [ ] 公网只开放 80/443；3000 不对公网或局域网监听。
- [ ] `https://正式域名/api/health` 与 `/api/ready` 成功，HTTP 自动跳转 HTTPS，浏览器无混合内容或证书告警。
- [ ] 后台登录响应的会话 Cookie 同时具备 `Secure`、`HttpOnly` 与 `SameSite=Lax`；伪造 Host/Origin 和绕过反代的公网请求被拒绝。
- [ ] `/welcome`、`/admin`、`/screen` 与 `/ws` 在实际域名同源工作；Caddy SPA fallback 不吞掉 API 错误。
- [ ] 正式 UI 显示受保护数据口径且无 Demo 重置入口；日志不含姓名、学号、令牌、Cookie、口令、抽奖身份映射或弹幕正文。
- [ ] 正式 NFC 映射已经用同一无路径 HTTPS origin 生成新文件，启动前逐行自动对账通过，并随机抽检“学号→卡片→本人档案”；旧相对映射不直接写卡。
- [ ] 在至少一台代表实际上线访问方式的实体手机，以及实际 OBS/大屏/网络链路完成现行人工门。
- [ ] 数据负责人、备份保管人、补卡/撤销、事件响应和 T+30 天删除复核人已经落名。

## 5. 更新、回滚与单实例纪律

每次发布先创建并验证新的正式备份包，再在新的 `<commit-sha>` release 中 frozen install、构建和跑门；不要就地修改 `/opt/sysu-welcome/current`。切换时：

1. 停止 `sysu-welcome`，确认旧进程退出且数据库没有第二个写者。
2. 原子切换 `current` symlink；若迁移或运行目录变化，先在独立副本完成专门维护门。
3. 启动服务并检查 health/ready、WebSocket、三端和日志。
4. 仅代码回滚可把 symlink 切回与当前 schema 兼容的 release；数据库回滚必须使用同代完整备份，不能让旧代码写入新 schema。
5. 保留旧 release 与旧运行目录到人工签核完成，再按数据治理流程清理。

Caddy reload 不应启动第二个 Node；systemd 的唯一 service 是当前单实例权威。任何蓝绿、多副本、容器编排或跨主机共享 SQLite 方案都不在本基线内。

## 6. 备份计划与恢复演练

- 至少在每次发布/迁移前、正式 NFC 批量发放后和活动开始前创建一份验证备份；活动期间是否追加定时备份由数据负责人按写入频率与恢复点目标决定。
- 每份包放在新时间戳目录，记录创建时间、提交 SHA、保管位置、恢复测试结果和删除期限；包内 manifest 不替代外层加密、访问审计和离机副本。
- 恢复演练只能输出到新的仓库外目录。演练通过标准是 checksum、SQLite 完整性、`PROTECTED` 分类、schema/人数、正式启动前验证全部通过，并确认未覆盖活动库。
- 真正切换恢复目录前停止服务；修改 `FORMAL_RUNTIME_DIR` 后启动并复核，再保留旧目录直到负责人签字。不要把恢复演练误称为生产故障恢复完成。
- 活动结束后按 [`DATA_PRIVACY.md`](./DATA_PRIVACY.md) 清理服务器运行目录、备份、传输暂存、运维下载和离机副本，并留下不含个人信息的删除记录。

## 7. 当前尚未代签的事项

仓库自动化已覆盖部署配置静态检查、生产启动 fail-closed、loopback 限制、Secure Cookie、在线备份、篡改拒绝和全新目录恢复。它没有访问实际服务器，也不能证明 DNS、Caddy 证书签发、systemd 权限、主机防火墙、真实 NFC、实体手机、OBS、LED 屏、场馆网络或负责人数据治理签核；这些在取得目标服务器和正式域名后继续执行 §4。
