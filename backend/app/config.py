"""Central configuration. Every external integration is keyed off env vars so the
same code runs live (keys present) or on labeled fallbacks (keys absent)."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent
SANDBOX_DIR = BASE_DIR / "data" / "sandbox"
RUNTIME_DIR = BASE_DIR.parent / "runtime"  # local state, outbox pdfs, quarantine


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(BASE_DIR.parent.parent / ".env", BASE_DIR.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Gemini (reasoning, routing, extraction, explanations) ---
    gemini_api_key: str = ""
    gemini_model: str = "gemini-flash-latest"

    # --- Google Maps Platform ---
    google_maps_api_key: str = ""

    # --- EIA open data (diesel by PADD) — free key, instant ---
    eia_api_key: str = ""

    # --- FMCSA QCMobile — WebKey via Login.gov ---
    fmcsa_webkey: str = ""

    # --- State: Mongo if reachable, JSON snapshot otherwise ---
    mongo_uri: str = "mongodb://localhost:27017"
    mongo_db: str = "sentinel"

    # --- Gmail (optional OAuth token file); otherwise Outbox simulator ---
    gmail_token_file: str = ""

    # --- Load board adapter: sandbox | dat | truckstop ---
    loadboard_adapter: str = "sandbox"

    # --- Demo pacing ---
    # Seconds of wall clock per simulated hour for long-running stages. A trip
    # + multi-week payment cycle compresses to well under a minute so the whole
    # arc is watchable on stage; every compression is disclosed in the trace.
    sim_seconds_per_hour: float = 0.02
    # Artificial pacing between trace beats so the demo reads on stage (seconds).
    trace_beat_delay: float = 0.35

    host: str = "127.0.0.1"
    port: int = 8787

    @property
    def has_gemini(self) -> bool:
        return bool(self.gemini_api_key)

    @property
    def has_maps(self) -> bool:
        return bool(self.google_maps_api_key)

    @property
    def has_eia(self) -> bool:
        return bool(self.eia_api_key)

    @property
    def has_fmcsa(self) -> bool:
        return bool(self.fmcsa_webkey)


@lru_cache
def settings() -> Settings:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    return Settings()
