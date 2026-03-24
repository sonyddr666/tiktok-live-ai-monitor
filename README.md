# 🎵 TikTok Live AI Monitor

Monitor de lives do TikTok com dashboard web em tempo real, som de gift e (fase 2) resposta por IA.

> Leia o [PLANO.md](./PLANO.md) para o plano completo do projeto.

## 🚀 Instalação Rápida

```bash
git clone https://github.com/sonyddr666/tiktok-live-ai-monitor
cd tiktok-live-ai-monitor
pip install -r requirements.txt
cp .env.example .env
python main.py
```

Acesse `http://localhost:8000`, digite o `@username` de qualquer live e clique em **Conectar**.

## 📦 Features (v0.1 — Monitor Puro)

- ✅ Conecta em qualquer live pelo `@username`
- ✅ Dashboard web dark mode em tempo real
- ✅ Chat ao vivo com avatar dos usuários
- ✅ Feed de gifts com animação
- ✅ Ranking TOP 10 gifters
- ✅ Contadores: viewers, gifts, comentários, seguidores
- ✅ **Som de alerta ao receber gift** (adicione `web/static/sounds/gift.mp3`)
- ✅ Reconexão automática em caso de erro

## 🤖 Fase 2 — IA (em desenvolvimento)

Ver [PLANO.md](./PLANO.md) para detalhes completos da integração com IA.

## 📂 Estrutura

```
monitor/collector.py    → captura eventos WebSocket do TikTok
web/server.py           → backend FastAPI + WebSocket
web/static/index.html   → dashboard
web/static/app.js       → frontend
config/settings.yaml    → todas as configurações
PLANO.md                → plano completo do projeto
```

## ⚠️ Aviso

Este projeto usa `TikTokLive`, uma biblioteca **não-oficial** baseada em engenharia reversa. Pode deixar de funcionar com atualizações do TikTok.
