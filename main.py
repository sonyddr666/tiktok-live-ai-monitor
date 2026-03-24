"""Entry point — inicia o servidor web do monitor."""
import os
import uvicorn
from dotenv import load_dotenv

load_dotenv()

if __name__ == "__main__":
    port = int(os.getenv("WEB_PORT", 8000))
    print(f"\n🎵 TikTok Live Monitor")
    print(f"   Acesse: http://localhost:{port}")
    print(f"   Digite o @username da live no dashboard\n")
    uvicorn.run(
        "web.server:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        log_level="warning"
    )
