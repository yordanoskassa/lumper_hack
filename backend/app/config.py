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
    mongo_db: str = "lumper_backstop"

    # --- Gmail OAuth token file. Reserved for a future Gmail sender; nothing
    #     reads it today, and it deliberately does NOT unlock a live send —
    #     outbound mail goes through Resend under the three locks below. ---
    gmail_token_file: str = ""

    # --- Resend (transactional email) ---
    # Having a key is NOT permission to send. A real delivery needs all three:
    # a key, MAIL_LIVE=true, and the recipient's domain on MAIL_LIVE_ALLOWLIST.
    # Anything else goes to the Outbox simulator and says so in the trace. The
    # sandbox brokers are *.example.com and are refused outright (tools/mail.py).
    resend_api_key: str = ""
    resend_from: str = ""
    resend_reply_to: str = ""
    mail_live: bool = False
    mail_live_allowlist: str = ""

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

    @property
    def has_resend(self) -> bool:
        return bool(self.resend_api_key and self.resend_from)

    @property
    def mail_allowlist(self) -> set[str]:
        """Recipient domains cleared for a real send. Empty = nobody."""
        return {d.strip().lower().lstrip("@")
                for d in self.mail_live_allowlist.split(",") if d.strip()}


@lru_cache
def settings() -> Settings:
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    return Settings()
