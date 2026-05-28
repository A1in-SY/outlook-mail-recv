# Outlook Mail Receiver

Outlook/Hotmail 邮箱批量管理工具，支持收件箱和垃圾箱邮件查看。

## 本地启动

### 后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8080
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

访问 http://localhost:5173

### 一键启动

```bash
./start.sh
```

## 容器部署

```bash
cp docker-compose.template.yml docker-compose.yml
cp backend/config.template.json backend/config.json
# 按需修改 docker-compose.yml 端口映射和 backend/config.json 密钥
docker compose up -d --build
```

## 配置项

### 密钥 (`backend/config.json`)

```json
{
  "secret_key": "your-secret-key-here"
}
```

修改后重启容器生效：`docker compose restart`

### 数据库

- 本地：`backend/outlook_mail.db`（SQLite，自动创建）
- 容器：挂载到 `./data/outlook_mail.db`

### 端口

- 本地开发：后端 8080，前端 5173（Vite 自动代理到后端）
- 容器：`docker-compose.yml` 中 `ports` 字段，宿主机端口自行配置
