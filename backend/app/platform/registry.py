"""Agent Registry: discovery + versioning. Each agent publishes a card —
who it is, what it does, which tools (scopes) it may touch, and who it hands
off to. The Gateway enforces exactly these scopes; the UI renders this page
so an outsider can discover the fleet the way a procurement manager would."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict


@dataclass
class AgentCard:
    key: str
    name: str
    version: str
    badge: str
    role: str
    handoff: str
    scopes: list[str]          # tool scopes this agent is allowed to call
    tools: list[str]           # human-readable tool list for the card
    loop: str = ""             # what it teaches the next run
    status: str = "idle"
    metrics: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)


REGISTRY: dict[str, AgentCard] = {}


def register(card: AgentCard) -> AgentCard:
    REGISTRY[card.key] = card
    return card


def get(key: str) -> AgentCard:
    return REGISTRY[key]


def cards() -> list[dict]:
    return [c.to_dict() for c in REGISTRY.values()]


def bootstrap() -> None:
    """Publish the fleet. Scopes are the contract the Gateway enforces —
    e.g. only Margin holds money-math scopes, only Handshake can send offers."""
    fleet = [
        AgentCard(
            key="YARD", name="Yard Boss", version="1.2.0", badge="Orchestrator",
            role="Routes every event, holds run state, decides who runs next.",
            handoff="Whoever fits the event",
            scopes=["events.route", "state.write", "tasks.schedule", "llm.route"],
            tools=["Event bus subscribe", "Task scheduler", "Run state doc", "Gemini function calling"],
            loop="Every refusal and override it routes is pinned to the audit log.",
        ),
        AgentCard(
            key="SCOUT", name="Scout", version="1.1.3", badge="Hunts loads",
            role="Wakes when the truck is two hours from empty and pulls raw postings.",
            handoff="Margin",
            scopes=["loadboard.read", "eld.read", "state.write"],
            tools=["DAT / Truckstop / 123Loadboard adapters", "Scheduler cron", "ELD position + HOS", "Candidate store write"],
            loop="Ghost's blacklist filters brokers here, before anyone spends an API call.",
        ),
        AgentCard(
            key="MARGIN", name="Margin", version="2.0.1", badge="Does the math",
            role="Kills most of the board. The only agent allowed to touch money math.",
            handoff="Ghost — top 5 only",
            scopes=["maps.routes", "maps.geocode", "fuel.price", "lanes.read", "hos.check", "state.write"],
            tools=["Maps Routes API", "Maps Geocoding", "EIA diesel by PADD", "Lane rate history", "HOS legality check"],
            loop="Lane history it computes becomes Handshake's negotiating anchor.",
        ),
        AgentCard(
            key="GHOST", name="Ghost", version="3.1.0", badge="Villain-killer",
            role="Runs before anyone calls. Hunts ghost brokers and shell reuse.",
            handoff="Handshake, or refuses",
            scopes=["fmcsa.read", "rdap.read", "graph.read", "graph.write", "llm.explain"],
            tools=["FMCSA QCMobile", "RDAP / WHOIS domain age", "Memory-graph collision query", "Gemini plain-English verdict"],
            loop="Payday's payment outcomes feed its risk graph; its blacklist feeds Scout.",
        ),
        AgentCard(
            key="HAND", name="Handshake", version="1.4.2", badge="Negotiates",
            role="Drafts the offer. Human sets the floor, human approves the send.",
            handoff="Fine Print",
            scopes=["lanes.read", "mail.send", "mail.read", "voice.io", "doc.generate", "state.write"],
            tools=["Lane comps anchor", "Gmail send + watch", "Voice approve (STT/TTS)", "Locked-terms write"],
            loop="The terms it locks are the reference Fine Print audits the paper against.",
        ),
        AgentCard(
            key="FINE", name="Fine Print", version="1.3.0", badge="Audits paper",
            role="Compares the rate con to what was agreed. Catches the short.",
            handoff="Mile Marker",
            scopes=["mail.read", "doc.extract", "armor.screen", "state.write", "llm.explain", "mail.send"],
            tools=["Gmail attachment watch", "Model Armor pre-screen", "Document AI extraction", "Diff vs locked terms", "Gemini correction draft"],
            loop="Every caught short becomes a broker-behavior record in the graph.",
        ),
        AgentCard(
            key="MILE", name="Mile Marker", version="1.0.8", badge="Runs the trip",
            role="Long-running, days. Wakes on events, reroutes around weather.",
            handoff="Payday on delivery",
            scopes=["maps.routes", "weather.read", "geofence.watch", "mail.send", "tasks.schedule", "state.write"],
            tools=["Routes API reroute", "NWS api.weather.gov", "Geofence detention clock", "Gmail ETA updates", "Scheduled wakeups"],
            loop="Geofence timestamps it records are Payday's detention evidence.",
        ),
        AgentCard(
            key="PAY", name="Payday", version="2.2.0", badge="Gets the money",
            role="Weeks long. POD chase, invoice, factoring, aging escalation.",
            handoff="Ghost memory graph",
            scopes=["mail.send", "mail.read", "vision.read", "doc.generate", "graph.write", "tasks.schedule", "state.write"],
            tools=["Gmail / SMS POD chase", "Vision POD read", "Invoice PDF generation", "Factoring packet", "Aging tracker"],
            loop="Days-to-pay per broker writes back to Ghost — slow payers become risk scores.",
        ),
    ]
    for card in fleet:
        register(card)
