# fufuyun-homework

服务家长和孩子之间的作业

GitHub 仓库和部署项目统一命名为 `fufuyun-homework`，服务器建议目录为 `/opt/fufuyun-homework`。数据库名及账号继续使用 `homework_assistant`，现有 MySQL 容器和外部网络名称不随项目改名。若曾以旧 Compose 项目名部署，切换名称前需迁移或复用原附件卷，避免新项目创建空卷；不要删除原数据卷。

家长微信小程序 + iPad 网页 + Fastify 服务端。复用已有 MySQL 8.3，单家庭私用，父母共用一个家长密码，多个孩子独立完成状态。**代码首版；尚未连接你的服务器或真实 Kimi、微信账号。**

## 功能与边界

- 粘贴文字、上传最多 5 张截图 / 导出文件 → Kimi 后台分析 → 家长核对编辑 → 按孩子发布。
- 支持 UTF-8 `.txt` 与约定 JSON，不承诺支持所有微信备份软件的专有格式、不自动读取微信群。
- Kimi 只生成草稿，无作业不允许发布。分析失败可以手动录入、保存发布或重试。通知不作为作业发布。
- iPad 浏览器通过一次性 12 位配对码绑定，10 分钟有效；专用设备只访问绑定孩子，共用设备可切换全部孩子；会话 90 天有效，可撤销。
- 孩子联网查看、勾选 / 取消完成；每 5 秒刷新当前清单。网络失败不会假装完成。**首版不提供离线编辑、推送通知、拍照提交、自动批改。**
- 网页提供 A4 打印样式，可通过浏览器“打印 / 存储 PDF”。打印清单包含要求与材料，原图在详情查看，不自动排版原图。小程序无直接控制打印机功能。
- 网页家长端可编辑已发布单项、撤回整批、撤销设备。单项修改会清除该项完成状态并提示更新。整批撤回会移除该批完成记录。
- 小程序家长端提供登录、添加孩子、导入、审核、发布、撤回、查看进度和生成配对码；已发布单项编辑、附件放大核对与设备撤销暂在网页完成。

导入 JSON 示例：

```json
{"messages":[{"text":"语文：朗读第 8 课，明天检查"},{"text":"数学：练习册第 12 页第 1—3 题"}]}
```

图片支持 JPG、PNG、WEBP，以文件签名检查，每个文件最多 8MB。源文字最多 5 万字符。被导入的消息和图片将发给 Kimi，家长在上传页可见说明。AI 不能保证识别正确，发布前须对照来源核对。

## 本地开发

需要 Node.js 24、npm、可用的 MySQL 8.3 独立开发库。

```bash
npm ci
cp .env.example .env
```

在 `.env` 配置开发库连接、至少 12 位的家长密码、自己的 `MOONSHOT_API_KEY`；不要使用生产库做测试。`DATA_DIR` 建议设为绝对路径。分别运行：

```bash
npm run dev:api
npm run dev:web
```

网页默认 `http://127.0.0.1:5173`，代理 API 到 `3100`。微信开发者工具导入 `apps/miniprogram`，将 `project.config.json` 中游客 AppID 改为自己的 AppID，将 `config.ts` 改为公开 HTTPS API 地址。开发者工具开启 TypeScript 编译，工具会生成 JS；这些生成文件不需手写。根目录安装的 `miniprogram-api-typings` 用于类型检查。

```bash
npm run typecheck
npm test
npm run build
```

Kimi 使用 Moonshot 的 Chat Completions 接口，通过服务端 `fetch` 调用，默认 `https://api.moonshot.cn/v1`、`kimi-k2.5`（关闭思考以获取直接 JSON 输出）。模型可通过 `MOONSHOT_MODEL` 更改，须确认账号对该模型有权限且支持图片与 JSON 输出。更换模型后应先用少量文字和截图验证，不在客户端配置密钥。不配置密钥可以手动整理，不提供伪造 AI 结果的回退。

官方接口参考：[Kimi 快速开始](https://platform.moonshot.cn/docs/guide/kimi-k2-5-quickstart)。平台可能跳转至新的文档域名；密钥需使用 Kimi 开放平台 API 密钥，而非聊天会员或其他产品凭据。

## 部署到已有服务器

本项目固定使用 Compose 项目名 `fufuyun-homework`，只创建 `api`、`web` 两个服务及自己的附件卷。不停止、不升级、不重建现有 `homework_mysql_prod`，也不操作其他应用。API 单实例、内存上限 512MB；Web 上限 128MB。构建时会临时使用额外资源，建议在本地 / CI 构建镜像或服务器低负载时执行。

### 1. 只读确认 MySQL 网络

```bash
docker inspect homework_mysql_prod --format '{{json .NetworkSettings.Networks}}'
```

已根据服务器输出确认现有网络为 `proj_source_homework_network`，`.env.example` 已填入该值。应用通过 `homework_mysql_prod:3306` 连接，Compose 使用 external 网络，不创建或替换原网络。无需开放新数据库端口，不通过公网 3306 连接。若日后迁移服务器，请重新执行上面的只读命令核对网络名。

### 2. 由数据库管理员创建本项目库和账号

查看 `deploy/init-db.sql`，替换密码后，通过你已有的 MySQL 管理方式执行。脚本只授权 `homework_assistant.*`，不授权其他业务库。

```sql
CREATE DATABASE IF NOT EXISTS homework_assistant CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'homework_assistant'@'%' IDENTIFIED BY '替换成独立强密码';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON homework_assistant.* TO 'homework_assistant'@'%';
```

若账号已经存在，`CREATE USER IF NOT EXISTS` 不会更新密码，须由管理员确认后单独更正；不要使用 root 账号作为应用连接账号。

### 3. 配置并启动

```bash
cp .env.example .env
chmod 600 .env
```

编辑 `.env`，配置 `DB_PASSWORD`、`PARENT_PASSWORD`、`MYSQL_NETWORK`、`MOONSHOT_API_KEY`。保持 `DB_HOST=homework_mysql_prod`、`DB_PORT=3306`。所有秘密都只在服务器上填写，不放进小程序、网页源码或聊天。

```bash
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl --fail http://127.0.0.1:52880/api/health
```

首次启动只在本项目数据库建表并记录迁移版本。数据库暂不可用会启动失败并由容器重启策略重试。版本 1 的建表是幂等的，升级后续表结构需要新增显式迁移，而不是只改建表语句。

### 4. 接入域名和 HTTPS

默认只绑定 `127.0.0.1:52880`，避免占用现有 Nginx 的端口。需要让现有入口将一个**独立域名**代理到该地址，并为其提供有效 HTTPS；不修改其他网站配置。如果现有反向代理在容器内，`127.0.0.1` 指向代理容器自身，不能直接用这个地址；应将本项目 web 与该代理加入专用入口网络，以服务别名访问 `web:80`，或者通过确认可达的宿主机地址访问。实际网络配置要根据服务器现状确定。

小程序管理后台需要配置对应 HTTPS 请求域名；此版本使用 `wx.request` 上传二进制 multipart，附件仍走同一 API 域名。正式发布前按微信后台当前要求完成账号、类目、隐私声明、域名和审核配置，并在真机关闭开发环境的域名校验豁免进行验证。

当前 Caddy 仅负责内部 HTTP、静态网页和 API 转发，TLS 由现有入口终止。不要把明文 HTTP 服务作为公网正式入口。未拿到服务器网络与域名信息前，不声称已经完成线上接入。

## 备份、升级、恢复

从项目根目录执行（Linux）：

```bash
bash scripts/backup.sh
```

备份脚本读取你自己维护的 shell 兼容 `.env`；含空格或 shell 特殊字符的值要用单引号括起。备份时短暂停止**本项目 API**以保持数据库和附件一致，现有 MySQL 与其他应用继续运行；脚本退出时尝试重新启动本项目 API。输出包括 `database.sql.gz`、`attachments/`，需复制到服务器之外。备份含孩子资料和会话，妥善保存。该脚本依赖现有 MySQL 容器内的 `mysqldump`，默认容器名 `homework_mysql_prod`，可用 `MYSQL_CONTAINER` 覆盖。

更新前备份，再执行 `docker compose up -d --build`。不要执行 `docker compose down -v`，否则会删除本项目附件卷。保留旧镜像；数据库有结构变更时，不能只退镜像而忽略数据库兼容。

恢复必须由管理员确认目标为本项目库：停止本项目 API，将 SQL 导入**空的专用库**，把 `attachments/` 的文件复制回本项目附件卷，确认 Node 用户 UID 1000 可读写，配置相同 `DB_NAME` 后再启动。数据库中附件保存的是容器内 `/app/data/<uuid>` 路径，恢复时保持该路径。不要将 SQL 导入其他业务库。至少做一次独立库与独立附件卷的恢复演练，再依赖备份。

数据库只做本项目备份，不执行 MySQL 全实例备份或改变现有容器。

## 架构与接口

单仓库：`apps/api`、`apps/web`、`apps/miniprogram`。所有服务端请求使用 Zod 校验；SQL 使用参数化查询。登录返回随机令牌，数据库只保存 SHA-256 摘要。家长密码从服务端环境读取，不写入数据表。配对码一次性消费。令牌通过 Authorization 请求头传递，不放 URL。

主要接口（均带 `/api` 前缀）：

| 接口 | 用途 |
|---|---|
| `POST /auth/login`、`POST /auth/pair` | 家长登录 / 孩子设备配对 |
| `GET /me`、`POST /auth/logout` | 当前身份 / 注销 |
| `GET/POST /children` | 孩子列表 / 新增 |
| `POST /pairing`、`GET /devices`、`DELETE /devices/:id` | 配对码和设备撤销 |
| `POST /imports` | multipart：text、workDate、childIds JSON、files |
| `GET /imports`、`GET/PUT /imports/:id` | 列表、来源、草稿编辑 |
| `POST /imports/:id/retry`、`publish`、`withdraw` | 重试、发布、撤回 |
| `GET /assignments?childId=&date=&pending=` | 按孩子日期 / 全部未完成查看 |
| `PUT /assignments/:id/complete` | 带 revision 设置完成状态 |
| `PUT /assignments/:id` | 家长修改并取消原完成状态 |
| `GET /assignments/:id/attachments`、`GET /attachments/:id` | 按权限查看附件 |

导入状态：queued → running → review / failed → published；failed 可重试或手动编辑；published 可撤回为 review。草稿保存和发布校验版本、发布使用事务，阻止同一批重复发布。AI 分析完成时提示同日同孩子的完全相同科目及内容；近似重复和后续新增重复仍需家长审核，系统不静默覆盖。

后台任务与应用同进程、一次分析一批、120 秒超时。任务保存在 MySQL，单实例重启将 running 恢复 queued；重试可能产生额外 AI 费用。**首版仅运行一个 API 实例**，不支持水平扩容。近 100 批导入、单孩子单次最多 1000 条作业，不是学校级多租户系统。

## 验收与待联调

自动测试涵盖：输入和日期校验、导出文件解析、未登录访问隔离、Kimi 结构化请求 / 响应与上游错误脱敏。另有真实 MySQL 集成测试（无测试数据库时跳过），覆盖发布幂等、孩子隔离、完成状态独立、修改版本冲突、配对码单次使用与设备撤销、撤回后附件禁止访问。

运行集成测试前，使用独立测试配置（环境变量提供数据库连接），设置 `RUN_MYSQL_TESTS=1`，且 `DB_NAME` 必须以 `_test` 结尾。测试会在该测试库建表并清理自身创建的测试家庭数据；禁止指向生产库。测试命令仍为 `npm test`。

上线前人工验收：

1. 创建两个孩子，导入文字、截图和样例文件，核对作业与通知是否正确区分。
2. 发布前孩子端不可见；发布后各孩子独立勾选，其他设备联网同步。
3. 专用设备访问其他孩子 / 未发布附件被拒绝；共享设备可切换。
4. 同一批重复发布返回冲突，不重复建作业；修改已完成作业后重新确认；撤回后不可见。
5. 密钥缺失、无效、额度不足、AI 超时 / 错误 JSON 均显示失败，可重试和手动编辑。
6. 重启 API 后，排队任务继续；数据与附件保持；备份恢复到独立测试库正确。
7. iPad Safari 横竖屏、原图放大、打印预览和实际打印机实测；微信真机执行上传和发布。

MySQL 联调、Docker 镜像构建、真实 Kimi 调用和微信 / iPad 真机验证，需相应环境和凭据；本地没有这些条件时不得视为已验证。

## Linux 构建缺少 Rollup 原生依赖

若日志提示缺少 `@rollup/rollup-linux-x64-gnu`，先更新到包含完整跨平台锁文件的版本，再重新构建。Dockerfile 显式安装可选依赖，并在前端编译前检查 Rollup / esbuild；回归测试检查锁文件是否包含各平台原生依赖。不要只在有旧 `node_modules` 的目录里删除锁文件重装，这可能再次丢失其他平台条目，参见 [npm 上游问题 #4828](https://github.com/npm/cli/issues/4828)。

```bash
git pull --ff-only
sudo docker compose build --no-cache api web
sudo docker compose up -d
```

重建应用不需要停止现有 MySQL，也不需要删除附件卷。
