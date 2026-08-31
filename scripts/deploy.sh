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

gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  aiplatform.googleapis.com --project "$PROJECT"

# Secrets travel as env vars set at deploy time, never baked into the image.
# MAIL_LIVE stays false: these agents draft and send on their own initiative.
gcloud run deploy "$SERVICE" \
  --source backend \
  --project "$PROJECT" \
  --region "$REGION" \
  --allow-unauthenticated \
  --memory 1Gi \
  --timeout 900 \
  --set-env-vars "GEMINI_MODEL=gemini-3.5-flash,LOADBOARD_ADAPTER=sandbox,MAIL_LIVE=false" \
  --set-env-vars "GEMINI_API_KEY=${GEMINI_API_KEY:?set GEMINI_API_KEY in your shell}" \
  --set-env-vars "GOOGLE_MAPS_API_KEY=${GOOGLE_MAPS_API_KEY:-}" \
  --set-env-vars "MONGO_URI=${MONGO_URI:-}"

URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"
echo
echo "Live:   $URL"
echo "Health: $URL/api/health"
echo
echo "Point the frontend at it:  VITE_API_BASE=$URL npm --prefix frontend run build"
