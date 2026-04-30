import os
from dotenv import load_dotenv

load_dotenv()

# Gemini API
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
GEMINI_LIVE_MODEL = os.getenv("GEMINI_LIVE_MODEL", "gemini-3.1-flash-live-preview")

# Judge0
JUDGE0_API_URL = os.getenv("JUDGE0_API_URL", "http://localhost:2358")
JUDGE0_API_KEY = os.getenv("JUDGE0_API_KEY", "")

# Firebase
FIREBASE_SERVICE_ACCOUNT_PATH = os.getenv(
    "FIREBASE_SERVICE_ACCOUNT_PATH", ""
)

# Server
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001").split(",")

# Judge0 Language IDs
LANGUAGE_IDS = {
    "python": 71,      # Python 3.8.1
    "javascript": 63,  # JavaScript (Node.js 12.14.0)
    "java": 62,        # Java (OpenJDK 13.0.1)
    "cpp": 54,         # C++ (GCC 9.2.0)
}
