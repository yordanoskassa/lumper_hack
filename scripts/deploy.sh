#!/usr/bin/env bash
# Deploy the agent backend to Google Cloud Run.
#
# Prereqs (one time, and only you can do these — they need your Google login):
#   1. Install the CLI:  https://cloud.google.com/sdk/docs/install
#   2. gcloud auth login
#   3. gcloud config set project YOUR_PROJECT_ID
#
# Then:  bash scripts/deploy.sh
set -euo pipefail

PROJECT="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"
REGION="${GOOGLE_CLOUD_REGION:-us-central1}"
SERVICE="${SERVICE_NAME:-lumper-backstop}"

if [ -z "$PROJECT" ] || [ "$PROJECT" = "(unset)" ]; then
  echo "No project set. Run: gcloud config set project YOUR_PROJECT_ID" >&2
  exit 1
fi

echo "Deploying $SERVICE to $PROJECT / $REGION"

# artifactregistry is required for --source builds and is easy to miss: the
# failure it produces is a permission error, not a "service disabled" one.
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com aiplatform.googleapis.com \
  --project "$PROJECT"

# Secrets travel as env vars set at deploy time, never baked into the image.
# Mail travels from your shell. MAIL_LIVE defaults to false; turning it on
# still requires a Resend key AND the recipient domain on the allowlist,
# and reserved sandbox domains are refused even then.
# Env travels in a file, not on the command line: RESEND_FROM contains spaces
# and angle brackets, and gcloud's comma-delimited --set-env-vars cannot carry
# those. The file is written to a temp path and removed on exit — secrets never
# land in the repo or in shell history.
ENV_FILE="$(mktemp -t backstop-env)"
trap 'rm -f "$ENV_FILE"' EXIT
python3 - "$ENV_FILE" <<'PY'
import json, os, sys
keys = ["GEMINI_API_KEY", "GEMINI_MODEL", "GOOGLE_MAPS_API_KEY", "MONGO_URI",
        "LOADBOARD_ADAPTER", "MAIL_LIVE", "MAIL_LIVE_ALLOWLIST",
        "RESEND_API_KEY", "RESEND_FROM", "RESEND_REPLY_TO", "DEMO_BROKER_EMAIL"]
env = {"GEMINI_MODEL": "gemini-3.5-flash", "LOADBOARD_ADAPTER": "sandbox",
       "MAIL_LIVE": "false"}
for k in keys:
    v = os.environ.get(k)
    if v:
        env[k] = v
# A localhost Mongo URI is meaningless inside a container and makes the Memory
# Bank hang on boot; the JSON snapshot fallback is the correct behaviour there.
if "localhost" in env.get("MONGO_URI", "") or "127.0.0.1" in env.get("MONGO_URI", ""):
    env.pop("MONGO_URI")
with open(sys.argv[1], "w") as f:
    json.dump(env, f)   # gcloud accepts JSON for --env-vars-file
PY

gcloud run deploy "$SERVICE" \
  --source backend \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 1Gi \
  --timeout 900 \
  --env-vars-file "$ENV_FILE"

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"
echo
echo "Live:   $URL"
echo "Health: $URL/api/health"
echo
echo "Point the frontend at it:  VITE_API_BASE=$URL npm --prefix frontend run build"
