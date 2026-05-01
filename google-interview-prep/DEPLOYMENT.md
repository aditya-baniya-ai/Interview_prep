# Deployment Guide

This deploys:
- **Backend** (FastAPI + WebSockets) → Google Cloud Run
- **Frontend** (Next.js 16) → Vercel

You only need to do this once per app; after that, redeploys are a single command.

---

## Prerequisites checklist

Run through this before starting. Each item is one command.

```bash
# 1. Node + npm (for Vercel CLI). Check:
node -v   # need ≥ 18

# 2. Docker (for local Cloud Run build verification, optional but recommended)
docker --version

# 3. gcloud CLI — install from https://cloud.google.com/sdk/docs/install
gcloud --version

# 4. Vercel CLI
npm i -g vercel
vercel --version
```

You also need:
- A Google Cloud project with **billing enabled** (your existing Firebase project `interview-prep-cb612` already counts — you just need to enable billing on it).
- Your `GEMINI_API_KEY` from Google AI Studio.
- Your Firebase web config (the `NEXT_PUBLIC_FIREBASE_*` values from `.env.local`).

---

## Part 1 — Deploy backend to Cloud Run

### 1a. Authenticate and set project

```bash
gcloud auth login
gcloud config set project interview-prep-cb612

# Enable required APIs (one-time)
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  firestore.googleapis.com
```

### 1b. Create an Artifact Registry repository (one-time)

```bash
gcloud artifacts repositories create interview-prep \
  --repository-format=docker \
  --location=us-central1 \
  --description="Container images for interview-prep backend"
```

### 1c. Build and deploy

From the **`backend/`** directory:

```bash
cd backend

# Build the image with Cloud Build (no local Docker needed)
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/interview-prep-cb612/interview-prep/backend:latest

# Deploy to Cloud Run
gcloud run deploy interview-prep-backend \
  --image us-central1-docker.pkg.dev/interview-prep-cb612/interview-prep/backend:latest \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --port 8080 \
  --timeout 3600 \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars "FIREBASE_PROJECT_ID=interview-prep-cb612,GEMINI_API_KEY=YOUR_GEMINI_KEY_HERE,CORS_ORIGINS=https://YOUR-VERCEL-DOMAIN.vercel.app
```

Replace:
- `YOUR_GEMINI_KEY_HERE` with your real Gemini API key
- `YOUR-VERCEL-DOMAIN` with your eventual Vercel domain (you can re-run with the real one after Part 2; use `https://*.vercel.app` as a temporary wildcard if needed)
- `YOUR_JUDGE0_KEY` if you're using RapidAPI Judge0 (or remove those two vars and Judge0 features will degrade gracefully)

**Save the URL Cloud Run prints** — looks like `https://interview-prep-backend-xxxxx-uc.a.run.app`. You'll need it for the frontend.
**https://interview-prep-backend-36076875979.us-central1.run.app**

### 1d. Grant Firestore access to the Cloud Run service account

```bash
PROJECT_NUMBER=$(gcloud projects describe interview-prep-cb612 --format="value(projectNumber)")
gcloud projects add-iam-policy-binding interview-prep-cb612 \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/datastore.user"
```

### 1e. Smoke-test the backend

```bash
# Replace with your Cloud Run URL
curl https://interview-prep-backend-xxxxx-uc.a.run.app/health
```

You should get a 200. WebSockets test happens after the frontend deploys.

---

## Part 2 — Deploy frontend to Vercel

### 2a. Login & link

From the **project root** (not `backend/`):

```bash
cd ..
vercel login
vercel link    # pick "Link to existing project" if you already created one, else create new
```

### 2b. Set environment variables in Vercel

Easiest: go to **Vercel dashboard → your project → Settings → Environment Variables**, and add each one for **Production, Preview, and Development**:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | `https://interview-prep-backend-xxxxx-uc.a.run.app` (your Cloud Run URL) |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | from your `.env.local` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | from your `.env.local` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | from your `.env.local` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | from your `.env.local` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | from your `.env.local` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | from your `.env.local` |

Or via CLI:

```bash
vercel env add NEXT_PUBLIC_BACKEND_URL production
# paste your Cloud Run URL when prompted
# repeat for each var
```

### 2c. Deploy

```bash
vercel --prod
```

Vercel will print your live URL (e.g. `https://google-interview-prep.vercel.app`).

### 2d. Add Vercel domain to Firebase Auth

Firebase rejects sign-ins from un-authorized domains. In **Firebase console → Authentication → Settings → Authorized domains**, add your Vercel domain.

### 2e. Update backend CORS with the real Vercel domain

Now that you know the real domain, update Cloud Run:

```bash
gcloud run services update interview-prep-backend \
  --region us-central1 \
  --update-env-vars "CORS_ORIGINS=https://google-interview-prep.vercel.app"
```

---

## Part 3 — Verify

1. Open your Vercel URL.
2. Sign in with Google.
3. Start an interview → check that the WebSocket connects (browser devtools → Network → WS tab should show a `wss://` connection to your Cloud Run URL).
4. Try running code → confirm Judge0 path works (or fails gracefully if you skipped it).

If the WebSocket fails, check Cloud Run logs:

```bash
gcloud run services logs read interview-prep-backend --region us-central1 --limit 50
```

---

## Redeploy cheatsheet

After the initial setup, every code change just needs:

```bash
# Backend
cd backend
gcloud builds submit --tag us-central1-docker.pkg.dev/interview-prep-cb612/interview-prep/backend:latest
gcloud run deploy interview-prep-backend --image us-central1-docker.pkg.dev/interview-prep-cb612/interview-prep/backend:latest --region us-central1

# Frontend (or just push to GitHub if you connected the repo to Vercel)
vercel --prod
```

**Pro tip:** in the Vercel dashboard, "Connect Git Repository" so every `git push` to `main` auto-deploys the frontend. Same is possible for Cloud Run via Cloud Build triggers, but the manual command above is fine for now.
