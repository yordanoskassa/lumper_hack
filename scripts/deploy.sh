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
gcloud run deploy "$SERVICE" \
  --source backend \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 1Gi \
  --timeout 900 \
  --set-env-vars "GEMINI_MODEL=gemini-3.5-flash,LOADBOARD_ADAPTER=sandbox" \
  --set-env-vars "^@^MAIL_LIVE=${MAIL_LIVE:-false}@MAIL_LIVE_ALLOWLIST=${MAIL_LIVE_ALLOWLIST:-}@RESEND_FROM=${RESEND_FROM:-}@RESEND_REPLY_TO=${RESEND_REPLY_TO:-}@RESEND_API_KEY=${RESEND_API_KEY:-}@DEMO_BROKER_EMAIL=${DEMO_BROKER_EMAIL:-}" \
  --set-env-vars "GEMINI_API_KEY=${GEMINI_API_KEY:?set GEMINI_API_KEY in your shell}" \
  --set-env-vars "GOOGLE_MAPS_API_KEY=${GOOGLE_MAPS_API_KEY:-}" \
  --set-env-vars "MONGO_URI=${MONGO_URI:-}"

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"
echo
echo "Live:   $URL"
echo "Health: $URL/api/health"
echo
echo "Point the frontend at it:  VITE_API_BASE=$URL npm --prefix frontend run build"
