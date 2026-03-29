import uvicorn
from src.core.config import config

if __name__ == "__main__":
    uvicorn.run(
        "src.main:socket_app",
        host="0.0.0.0",
        port=config.PORT,
        reload=config.APP_ENV == "development",
        log_level=config.LOG_LEVEL,
    )
