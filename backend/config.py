"""Central config. Everything is env-driven so the app runs with mocks locally
and goes live by flipping env vars (see .env.example)."""
import os

# --- Mode switches (mock keeps the app fully runnable with no cloud creds) ---
GEMINI_MODE = os.getenv("GEMINI_MODE", "mock").lower()    # mock | live
VAHAN_MODE = os.getenv("VAHAN_MODE", "mock").lower()      # mock | live
STORE_MODE = os.getenv("STORE_MODE", "memory").lower()    # memory | firestore

# --- Gemini / Vertex ---
USE_VERTEX = os.getenv("USE_VERTEX", "true").lower() == "true"
GOOGLE_CLOUD_PROJECT = os.getenv("GOOGLE_CLOUD_PROJECT", "")
VERTEX_LOCATION = os.getenv("VERTEX_LOCATION", "us-central1")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")   # GA, stable for the demo
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")              # only if USE_VERTEX=false (AI Studio)

# --- Storage ---
GCS_BUCKET = os.getenv("GCS_BUCKET", "")   # empty => photos not uploaded (local placeholder URIs)

# --- VAHAN RC provider (Surepass / Signzy / Zoop / Gridlines) ---
VAHAN_API_URL = os.getenv("VAHAN_API_URL", "")
VAHAN_API_KEY = os.getenv("VAHAN_API_KEY", "")

# --- Web ---
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")]
PORT = int(os.getenv("PORT", "8080"))   # Cloud Run injects PORT
