# AWS + GitHub Setup Guide — SmartInvoice

Follow these steps in order. Takes about 30–45 minutes on first setup.

---

## PART 1 — AWS Account & IAM Credentials

### Step 1.1 — Create an AWS Account
If you don't have one:
1. Go to https://aws.amazon.com → click **"Create an AWS Account"**
2. Enter email, password, account name
3. Add a credit card (you won't be charged until you exceed free tier)
4. Choose **Basic Support** (free)
5. Verify your phone number

### Step 1.2 — Create an IAM User (DO NOT use root account)
Root account is like admin — too risky to use for deployments.

1. Log into AWS Console → search for **IAM** in the top search bar
2. Click **Users** in the left sidebar → click **Create user**
3. Username: `smartinvoice-deployer`
4. Click **Next**
5. Select **Attach policies directly**
6. Search and check these policies:
   - `AdministratorAccess` ← for now, simplest option (you can restrict later)
7. Click **Next** → **Create user**

### Step 1.3 — Get Your Access Keys
1. Click on the user you just created (`smartinvoice-deployer`)
2. Go to the **Security credentials** tab
3. Scroll to **Access keys** → click **Create access key**
4. Select **Command Line Interface (CLI)**
5. Check the confirmation box → click **Next** → **Create access key**
6. **IMPORTANT:** Copy both values NOW — you won't see the secret again:
   - **Access key ID** → looks like: `AKIAIOSFODNN7EXAMPLE`
   - **Secret access key** → looks like: `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY`
7. Save them somewhere safe (password manager, etc.)

---

## PART 2 — GitHub Secrets

GitHub Secrets are like a secure `.env` file for your CI/CD pipeline.

### Step 2.1 — Open GitHub Secrets
1. Go to your GitHub repo: https://github.com/YOUR_USERNAME/YOUR_REPO
2. Click **Settings** tab (top of repo page)
3. In the left sidebar → **Secrets and variables** → **Actions**
4. Click **New repository secret** for each secret below

### Step 2.2 — Add These Secrets (do them one by one)

#### Secret 1: AWS_ACCESS_KEY_ID
- Name: `AWS_ACCESS_KEY_ID`
- Value: The Access key ID from Step 1.3 (e.g. `AKIAIOSFODNN7EXAMPLE`)

#### Secret 2: AWS_SECRET_ACCESS_KEY
- Name: `AWS_SECRET_ACCESS_KEY`
- Value: The Secret access key from Step 1.3

#### Secret 3: DB_PASSWORD
- Name: `DB_PASSWORD`
- Value: Make up a strong password for your database
  - Rules: 8+ chars, letters + numbers, no special characters like `@`, `/`, `"`
  - Example: `SmartInvoice2025`
  - **Write this down** — you'll need it to build DATABASE_URL in Step 4

#### Secret 4: ANTHROPIC_API_KEY
- Name: `ANTHROPIC_API_KEY`
- Value: Copy from your `backend/.env` file (the `sk-ant-api03-...` value)

#### Secrets 5 & 6: DATABASE_URL and REACT_APP_API_URL — SKIP FOR NOW
> GitHub doesn't allow empty secret values.
> **Just don't create these two secrets yet.**
> GitHub Actions treats missing secrets as empty strings automatically — the first deploy will still work (it'll use SQLite as fallback).
> You'll create these in Step 4.4 after you have real values.

#### Secret 5 (after Part 3 Terraform): FRONTEND_S3_BUCKET
- Name: `FRONTEND_S3_BUCKET`
- Value: `smartinvoice-dev-frontend` ← Terraform will create this bucket

#### Secret 6 (after Part 3 Terraform): CLOUDFRONT_DISTRIBUTION_ID
- Name: `CLOUDFRONT_DISTRIBUTION_ID`
- Value: *(get this from Terraform output in Step 3.3)*

#### Secret 7 (after Part 3 Terraform): ALLOWED_ORIGINS
- Name: `ALLOWED_ORIGINS`
- Value: *(get this from Terraform output in Step 3.3)*

---

## PART 3 — Frontend S3 + CloudFront via Terraform (runs in GitHub Actions)

No local installs needed. Terraform runs in GitHub Actions and automatically sets the secrets for you.

### Step 3.1 — Create a GitHub Personal Access Token (PAT)
The Terraform workflow needs permission to set GitHub Secrets on your behalf.

1. Go to GitHub → click your **profile photo** (top right) → **Settings**
2. Scroll down the left sidebar → **Developer settings** → **Personal access tokens** → **Tokens (classic)**
3. Click **Generate new token (classic)**
4. Note: `SmartInvoice Terraform`
5. Expiration: `90 days` (or "No expiration" if you prefer)
6. Check the scope: **`repo`** (the whole repo checkbox — this includes secrets write)
7. Click **Generate token**
8. **Copy the token** (starts with `ghp_...`) — you won't see it again

### Step 3.2 — Add the PAT as a GitHub Secret
1. GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
   - Name: `GH_PAT`
   - Value: paste the token from Step 3.1
3. Click **Add secret**

### Step 3.3 — Run the Terraform workflow
1. GitHub repo → click the **Actions** tab
2. In the left sidebar, click **"Deploy Infrastructure (Terraform)"**
3. Click **"Run workflow"** (top right of the workflow list)
4. Settings:
   - Stage: `dev`
   - Action: `apply`
5. Click **Run workflow** (green button)
6. Wait ~5 minutes (CloudFront takes time to propagate globally)

### Step 3.4 — Check the output
1. Click on the running workflow → click the `terraform` job
2. Expand the **"Set GitHub Secrets from Terraform outputs"** step
3. You'll see:
```
✅ GitHub Secrets set automatically!

📦 Frontend bucket : smartinvoice-dev-frontend
☁️  CloudFront URL  : https://d1234abcd.cloudfront.net
🔑 CF Distribution : E1234ABCD5678
```

**The `FRONTEND_S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`, and `ALLOWED_ORIGINS` secrets are set automatically — nothing to copy/paste.**

---

## PART 4 — First Deploy (Push to forecasting branch)

### Step 4.1 — Trigger the deployment
The CI/CD pipeline triggers automatically when you push to the `forecasting` branch.

```bash
# In your terminal, from the repo root:
git add .
git commit -m "chore: Add AWS infrastructure and CI/CD"
git push origin forecasting
```

### Step 4.2 — Watch the pipeline run
1. Go to your GitHub repo → click the **Actions** tab
2. You'll see two workflows running:
   - "Deploy Backend" — takes 10–15 minutes (Docker build for Python deps)
   - "Deploy Frontend" — takes 3–5 minutes
3. Click on each one to see logs in real time
4. Green checkmark = success. Red X = something went wrong (check the logs)

### Step 4.3 — Get the RDS endpoint (after backend deploys successfully)
1. Go to AWS Console → search for **CloudFormation**
2. You'll see a stack named `invoicemanagement-backend-dev`
3. Click on it → go to **Outputs** tab
4. Copy the value next to `RDSEndpoint` — looks like:
   `smartinvoice-dev-db.abc123xyz.us-east-1.rds.amazonaws.com`
5. Also copy `ApiGatewayUrl` — looks like:
   `https://abc123xyz.execute-api.us-east-1.amazonaws.com/dev`

### Step 4.4 — Update GitHub Secrets with real values

#### Update DATABASE_URL:
- Name: `DATABASE_URL`
- Value (replace the placeholders):
```
postgresql://smartinvoice_admin:YOUR_DB_PASSWORD@RDS_ENDPOINT:5432/smartinvoice?sslmode=require
```
Example:
```
postgresql://smartinvoice_admin:SmartInvoice2025@smartinvoice-dev-db.abc123xyz.us-east-1.rds.amazonaws.com:5432/smartinvoice?sslmode=require
```

#### Update REACT_APP_API_URL:
- Name: `REACT_APP_API_URL`
- Value: the `ApiGatewayUrl` from CloudFormation outputs
```
https://abc123xyz.execute-api.us-east-1.amazonaws.com/dev
```

---

## PART 5 — Second Deploy (activates the database)

Push again to trigger a fresh deploy with the real DATABASE_URL:

```bash
git commit --allow-empty -m "chore: Activate RDS database"
git push origin forecasting
```

After this deploy:
- Your app is live at the API Gateway URL
- Data persists in RDS (not SQLite)
- PDFs are stored in S3

---

## PART 6 — Access Your Live App

### Backend API
Your API is live at:
`https://abc123xyz.execute-api.us-east-1.amazonaws.com/dev`

Test it:
```bash
curl https://abc123xyz.execute-api.us-east-1.amazonaws.com/dev/health
```

Swagger docs:
`https://abc123xyz.execute-api.us-east-1.amazonaws.com/dev/docs`

### Frontend
Your React app is at the S3 website URL:
1. Go to AWS Console → S3 → click your `smartinvoice-dev-frontend` bucket
2. Go to **Properties** → scroll to **Static website hosting**
3. Copy the **Bucket website endpoint** — looks like:
   `http://smartinvoice-dev-frontend.s3-website-us-east-1.amazonaws.com`

---

## PART 7 — (Optional) Set Up CloudFront for Frontend

CloudFront gives you HTTPS + faster loading via CDN. Do this after the basics work.

1. AWS Console → **CloudFront** → **Create distribution**
2. Origin domain: click the field → select your S3 bucket website endpoint
   - Use the S3 website URL (not the S3 bucket ARN) to support React Router
3. Default root object: `index.html`
4. Click **Create distribution**
5. Wait ~10 minutes for it to deploy globally
6. Copy the **Distribution domain name** (looks like `d1234abcd.cloudfront.net`)
7. Add to GitHub Secrets:
   - `CLOUDFRONT_DISTRIBUTION_ID` = the distribution ID (e.g. `E1234ABCD5678`)
   - Update `ALLOWED_ORIGINS` secret to include the CloudFront URL:
     `http://localhost:3000,https://d1234abcd.cloudfront.net`

---

## Summary — GitHub Secrets Checklist

| Secret | Status |
|--------|--------|
| `AWS_ACCESS_KEY_ID` | Set in Step 2.2 |
| `AWS_SECRET_ACCESS_KEY` | Set in Step 2.2 |
| `DB_PASSWORD` | Set in Step 2.2 |
| `ANTHROPIC_API_KEY` | Set in Step 2.2 |
| `DATABASE_URL` | Set in Step 4.4 (after first deploy) |
| `REACT_APP_API_URL` | Set in Step 4.4 (after first deploy) |
| `FRONTEND_S3_BUCKET` | Set in Step 2.2 |
| `CLOUDFRONT_DISTRIBUTION_ID` | Optional — Step 7 |
| `ALLOWED_ORIGINS` | Optional — Step 7 |

---

## Cost Estimate (dev environment)

| Service | Cost |
|---------|------|
| Lambda | Free (1M requests/month free tier) |
| API Gateway | Free (1M calls/month free tier) |
| RDS t3.micro | ~$13/month (not free tier) |
| S3 uploads bucket | <$1/month |
| S3 frontend bucket | <$0.01/month |
| CloudFront | Free (1TB/month free tier) |
| **Total** | **~$13–15/month** |

> RDS t3.micro is the main cost. You can stop/start it from the AWS Console when not in use to save money during development.
