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
    """Publish the fleet: four specialists and the orchestrator that routes
    them. Scopes are the contract the Gateway enforces — only Finder holds
    money-math scopes, only Closer can send an offer, only Payday can bill."""
    fleet = [
        AgentCard(
            key="YARD BOSS", name="Yard Boss", version="3.0.0", badge="Orchestrator",
            role="Routes every event and every sentence you type. Holds run state, decides who runs next.",
            handoff="Finder, Verifier, Closer or Payday",
            scopes=["events.route", "state.write", "tasks.schedule", "llm.route"],
            tools=["Gemini function calling", "Event bus subscribe", "Task scheduler", "Run state doc"],
            loop="Every refusal and override it routes is pinned to the audit log.",
        ),
        AgentCard(
            key="FINDER", name="Finder", version="3.0.0", badge="Finds the money",
            role="Wakes when the truck is two hours from empty, pulls every board, "
                 "and proves each load actually clears a profit before anyone looks at it.",
            handoff="Verifier — survivors only",
            scopes=["loadboard.read", "eld.read", "maps.routes", "maps.geocode",
                    "fuel.price", "lanes.read", "hos.check", "state.write", "llm.explain"],
            tools=["DAT / Truckstop / 123Loadboard adapters", "ELD position + HOS",
                   "Maps Routes + Geocoding", "EIA diesel by PADD", "Lane rate history",
                   "Gemini shortlist reasoning"],
            loop="Widens its own search radius when the board comes back thin; "
                 "Verifier's blacklist filters brokers before it spends an API call.",
        ),
        AgentCard(
            key="VERIFIER", name="Verifier", version="3.0.0", badge="Villain-killer",
            role="Proves the broker is who the posting says it is, then audits the paper "
                 "they send back. Runs before anyone picks up the phone.",
            handoff="Closer, or refuses the run",
            scopes=["fmcsa.read", "rdap.read", "graph.read", "graph.write", "memory.read",
                    "memory.write", "llm.explain", "mail.read", "mail.send", "doc.extract",
                    "armor.screen", "state.write"],
            tools=["FMCSA QCMobile authority/insurance/OOS", "Callback-contact cross-check",
                   "RDAP / WHOIS domain age", "Memory Bank recall (unpaid, ACH, blacklist)",
                   "Model Armor pre-screen", "Document AI extraction + diff",
                   "Gemini plain-English verdict"],
            loop="Payday's payment and detention outcomes feed its risk graph; "
                 "its blacklist feeds Finder.",
        ),
        AgentCard(
            key="CLOSER", name="Closer", version="3.0.0", badge="Closes the deal",
            role="Negotiates off lane comps, chases the broker until they answer, locks the "
                 "terms, assigns the driver, and runs the trip to the dock.",
            handoff="Payday on arrival",
            scopes=["lanes.read", "mail.send", "mail.read", "voice.io", "doc.generate",
                    "maps.routes", "weather.read", "geofence.watch", "tasks.schedule",
                    "state.write", "llm.explain"],
            tools=["Lane comps anchor", "Gemini counter-offer reasoning",
                   "Bounded retry + backoff on broker silence", "Voice approve (STT/TTS)",
                   "Gmail send + watch", "Locked-terms write", "Routes API + NWS reroute"],
            loop="The terms it locks are the reference Verifier audits the paper against.",
        ),
        AgentCard(
            key="PAYDAY", name="Payday", version="3.0.0", badge="Gets the money",
            role="Everything that turns a delivered load into cash: the detention clock at "
                 "the dock, the POD, the invoice, the factoring packet and the collection fight.",
            handoff="Verifier's memory graph",
            scopes=["mail.send", "mail.read", "vision.read", "doc.generate", "graph.read",
                    "graph.write", "memory.read", "memory.write", "maps.geocode",
                    "geofence.watch", "tasks.schedule", "state.write", "llm.explain"],
            tools=["GPS geofence detention clock", "Timestamped broker notice",
                   "Bounded escalation + claim filing", "Vision POD read + GPS match",
                   "Invoice PDF + factoring packet", "Aging tracker",
                   "Gemini claim + escalation drafting"],
            loop="Days-to-pay and denied detention claims write back to Verifier — "
                 "slow payers and stallers become risk scores on the next screen.",
        ),
    ]
    for card in fleet:
        register(card)
