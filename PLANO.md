# 🎯 TikTok Live AI Monitor — Plano Completo

> Versão: 1.0  
> Status: Em desenvolvimento

---

## 📋 Visão Geral

Sistema que monitora lives do TikTok em tempo real, coleta dados de eventos (gifts, comentários, usuários online, likes) e usa uma IA em modo **conversa** para responder de forma inteligente tanto para o streamer quanto para o chat — com controle total de custo de tokens.

---

## 🏗️ Arquitetura do Projeto

```
tiktok-live-ai-monitor/
├── PLANO.md                   ← Este arquivo
├── monitor/
│   ├── collector.py           ← Captura eventos do TikTokLive (WebSocket)
│   ├── profile_fetcher.py     ← Busca dados de perfil do usuário (opcional)
│   └── event_buffer.py        ← Buffer de eventos por janela de tempo/qty
├── ai/
│   ├── ai_agent.py            ← Agente IA em modo conversa
│   ├── prompt_builder.py      ← Monta contexto otimizado (anti-token-waste)
│   └── turn_controller.py     ← Controla quando disparar a IA
├── web/
│   ├── server.py              ← Backend FastAPI + WebSocket
│   ├── static/
│   │   ├── index.html         ← Dashboard web
│   │   ├── app.js             ← Frontend JS com WebSocket
│   │   └── sounds/
│   │       └── gift.mp3       ← Som de presente
│   └── templates/
├── config/
│   └── settings.yaml          ← Todas as configs do sistema
├── requirements.txt
└── main.py                    ← Entry point
```

---

## ⚙️ Fase 1 — Monitor de Dados Puro (SEM IA)

> **Objetivo:** Conectar em qualquer live pelo @username, exibir dados em tempo real numa web com som de gift.

### Eventos Capturados
| Evento | Dados Coletados |
|--------|----------------|
| `GiftEvent` | user, gift_name, coin_value, repeat_count, avatar_url |
| `CommentEvent` | user, texto, timestamp |
| `JoinEvent` | user, timestamp |
| `LikeEvent` | user, like_count |
| `FollowEvent` | user |
| `ShareEvent` | user |
| `RoomUserSeqEvent` | viewer_count |
| `LiveEndEvent` | — encerra o monitor |

### Web Dashboard (Fase 1)
- Input para digitar qualquer `@username` e conectar
- Painel de **viewers em tempo real**
- Feed de comentários ao vivo
- Feed de gifts com nome do presente e valor em coins
- **Ranking TOP 10 gifters** atualizado em tempo real
- **Som de alerta** ao receber gift (arquivo `.mp3` local)
- Reconexão automática em caso de queda

---

## 🤖 Fase 2 — Integração com IA (Modo Conversa)

### Conceito Principal
A IA fica em **modo conversa contínua** — ela tem memória do contexto da live e responde tanto ao streamer quanto ao chat. Os dados são agrupados antes de ir para a IA para **minimizar tokens gastos**.

### Modos de Disparo da IA

Configuráveis via `settings.yaml`:

```yaml
ai:
  trigger_mode: "turn"          # turn | message_threshold | gift | hybrid
  
  turn:
    interval_seconds: 60        # A cada 60s agrupa tudo e envia pra IA
    
  message_threshold:
    max_messages: 20            # Dispara quando acumular 20 mensagens
    low_activity_threshold: 3   # Se tiver menos de 3 msgs/min, pode disparar antes
    
  gift:
    enabled: true               # Sempre dispara ao receber gift
    lookup_profile: true        # Se true, busca perfil do doador
    profile_mode: "name_only"   # name_only | full_profile
```

#### Modo `turn` (Por Turnos)
- Acumula eventos num buffer por `X segundos`
- Agrupa: gifts recebidos, comentários relevantes, novos seguidores, viewers count
- Manda tudo num único prompt comprimido pra IA
- IA responde com análise do turno + sugestão de interação pro streamer

#### Modo `message_threshold` (Por Volume)
- Monitora atividade do chat em tempo real
- **Live lotada (alta atividade):** acumula mais mensagens antes de disparar
- **Live vazia (baixa atividade):** dispara mais rápido pra manter engajamento
- Configurável: `max_messages`, `low_activity_threshold` (msgs/min)

#### Modo `gift` (Por Presente)
- Toda vez que um gift é recebido, dispara análise
- **`name_only`:** IA só recebe nome/username do doador (zero custo extra)
- **`full_profile`:** sistema busca perfil público do usuário (followers, bio, avatar) antes de enviar pra IA
- IA gera resposta personalizada citando o doador

#### Modo `hybrid`
- Combina gift (sempre) + turn (backup de tempo)

---

## 💰 Controle de Custo de Tokens

Esta é a parte mais crítica do projeto.

### Estratégias Implementadas

#### 1. Compressão do Contexto
Ao invés de enviar cada mensagem individualmente, o `prompt_builder.py` comprime o buffer:
```
# Ruim (alto custo):
"Carlos disse: oi", "Carlos disse: tô aqui", "Carlos disse: manda um som"

# Bom (baixo custo):
"Carlos (3 msgs): oi, tô aqui, manda um som"
```

#### 2. Janela de Contexto Rolante
- A IA mantém apenas os **últimos N turnos** em memória
- Configurável: `ai.context_window_turns: 5`
- Turnos antigos são descartados do contexto

#### 3. Filtragem de Eventos Irrelevantes
- `JoinEvent` de usuários sem histórico → descartado
- Likes repetidos do mesmo usuário → agregado (`Carlos curtiu 47x`)
- Comentários com spam ou repetição → filtrado

#### 4. Sistema de Prioridade
```yaml
ai:
  priority_filter:
    gifts: always           # Gifts SEMPRE chegam à IA
    followers: always       # Novos seguidores SEMPRE
    comments: if_relevant   # Comentários só se passarem no filtro
    joins: never            # Entradas de usuário NÃO vão pra IA
    likes: aggregate_only   # Só o total agregado vai
```

#### 5. Budget por Hora
```yaml
ai:
  token_budget:
    max_tokens_per_hour: 50000   # Limite de tokens/hora
    alert_at_percent: 80         # Alerta quando chegar em 80%
    fallback_mode: "turn_only"   # Se estourar, vai pra modo turn com intervalo maior
```

---

## 👤 Módulo de Perfil do Usuário

### Quando ativar
- Apenas em `gift` events
- Apenas se `profile_mode: full_profile`
- Cache de perfil: se o user já foi buscado nessa sessão, usa o cache (zero chamada extra)

### Dados buscados
```python
profile = {
    "unique_id": "@carlos123",
    "nickname": "Carlos",
    "follower_count": 1520,
    "following_count": 340,
    "bio": "fã do streamer",
    "avatar_url": "...",
    "is_follower": True,   # se já segue o streamer
}
```

### Prompt gerado (custo mínimo)
```
[GIFT] @carlos123 (Carlos, 1.5k seguidores, já te segue) enviou 5x "Rose" (5 coins cada)
```

---

## 🔁 Fluxo Completo da IA

```
TikTok Live
    │
    ▼
collector.py ──► event_buffer.py
                      │
               turn_controller.py
               (verifica trigger_mode)
                      │
               profile_fetcher.py  ◄── (só se gift + full_profile)
                      │
               prompt_builder.py
               (comprime + filtra)
                      │
               ai_agent.py  ◄──── mantém histórico da conversa
                      │
               [Resposta da IA]
                      │
            ┌─────────┴──────────┐
            ▼                    ▼
      Web Dashboard        Console / Log
   (exibe pra streamer)   (para debug)
```

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|--------|------------|
| Captura de Live | `TikTokLive` (Python, isaackogan) |
| Backend API | `FastAPI` + `uvicorn` |
| WebSocket web | `FastAPI WebSocket` |
| Frontend | HTML + Vanilla JS (sem framework) |
| IA | OpenAI GPT-4o-mini / Gemini Flash (configurável) |
| Config | `PyYAML` |
| Cache de perfil | Dict em memória (por sessão) |
| Som | HTML5 Audio API |

---

## 📦 Roadmap de Versões

### v0.1 — Monitor Web Puro ✅ (fase atual)
- [ ] Conectar em qualquer live por @username
- [ ] Dashboard web com eventos em tempo real
- [ ] Ranking de gifts
- [ ] Som ao receber gift
- [ ] Reconexão automática

### v0.2 — IA Básica
- [ ] Integrar modelo (GPT-4o-mini ou Gemini Flash)
- [ ] Modo `turn` funcionando
- [ ] Prompt builder com compressão
- [ ] Resposta exibida no dashboard

### v0.3 — Controle Avançado
- [ ] Modo `message_threshold` com detecção de atividade
- [ ] Modo `gift` com perfil do usuário
- [ ] Budget de tokens com fallback
- [ ] Settings via UI (sem editar YAML)

### v0.4 — IA em Conversa
- [ ] IA responde diretamente ao streamer (modo chat)
- [ ] Janela de contexto rolante
- [ ] Histórico exportável da sessão

---

## 🔐 Variáveis de Ambiente

```env
TIKTOK_USERNAME=@seu_usuario
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...  # alternativa
AI_MODEL=gpt-4o-mini
WEB_PORT=8000
```

---

## ⚠️ Notas Importantes

- `TikTokLive` é uma lib **não-oficial** baseada em engenharia reversa
- Requer `SignAPI` (Euler Stream) para funcionar — pode ter limites de rate
- Perfis de usuário são obtidos via scraping, não via API oficial
- Toda sessão de live é uma nova instância do client
