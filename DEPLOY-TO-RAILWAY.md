# Deploy to Railway (Free Hosting)

This guide will get your Casefile Extractor running online in about 10 minutes. No coding required — just clicking and pasting.

---

## What You'll Need

1. A **GitHub account** (free) — [Sign up here](https://github.com/signup)
2. A **Railway account** (free) — [Sign up here](https://railway.app/)
3. Your **Anthropic API key** — [Get one here](https://console.anthropic.com/)

---

## Step 1: Upload Code to GitHub

### 1.1 Create a new repository

1. Go to [github.com/new](https://github.com/new)
2. Fill in:
   - **Repository name:** `casefile-extractor`
   - **Description:** (optional) "Extract entities and images from Casefile episodes"
   - **Visibility:** Private (recommended) or Public
3. Click **Create repository**

### 1.2 Upload the files

1. On your new repository page, click **"uploading an existing file"** link
2. Drag and drop ALL the files from the `casefile-app` folder:
   ```
   app/
   .gitignore
   next.config.js
   next-env.d.ts
   package.json
   README.md
   tsconfig.json
   ```
   ⚠️ **DO NOT upload** `.env.local` or `.env.local.example` (your API key should stay private)

3. Scroll down and click **Commit changes**

---

## Step 2: Deploy on Railway

### 2.1 Connect Railway to GitHub

1. Go to [railway.app](https://railway.app/) and sign in
2. Click **New Project**
3. Select **Deploy from GitHub repo**
4. If prompted, authorize Railway to access your GitHub
5. Find and select your `casefile-extractor` repository

### 2.2 Configure the deployment

Railway will detect it's a Next.js app automatically. Just wait for it to start building.

### 2.3 Add your API key

This is the important part — telling Railway your secret API key:

1. In your Railway project, click on your service (the purple box)
2. Go to the **Variables** tab
3. Click **+ New Variable**
4. Add:
   - **Variable name:** `ANTHROPIC_API_KEY`
   - **Value:** `sk-ant-your-actual-key-here` (paste your real key)
5. Click **Add**

Railway will automatically redeploy with your new variable.

### 2.4 Get your URL

1. Go to the **Settings** tab
2. Scroll to **Networking**
3. Click **Generate Domain**
4. You'll get a URL like: `casefile-extractor-production.up.railway.app`

**That's your app!** Open it in your browser.

---

## Step 3: Use Your App

1. Go to your Railway URL
2. Paste a Casefile episode URL
3. Click **Extract**
4. Wait 30-60 seconds
5. See your results with images and pronouns!

---

## Cost

**Railway Free Tier includes:**
- 500 hours of runtime per month
- $5 of usage credit
- More than enough for personal use

If you use the app a few times a day, you'll stay well within free limits.

**Anthropic API costs:**
- ~$0.02-0.05 per episode analyzed
- Billed to your Anthropic account

---

## Troubleshooting

### "Application error" or blank page
- Check Railway logs: Click your service → **Deployments** → Click latest deployment → **View Logs**
- Usually means the API key isn't set correctly

### "ANTHROPIC_API_KEY not configured"
- Go to Railway → your service → **Variables**
- Make sure `ANTHROPIC_API_KEY` is set (no typos, includes `sk-ant-`)

### Build failed
- Check that all files were uploaded to GitHub
- Make sure you have the `app/` folder with all its contents

### App is slow to start
- Railway free tier "sleeps" after 5 minutes of inactivity
- First request after sleep takes ~10-15 seconds to wake up
- Subsequent requests are fast

---

## Updating Your App

If you ever need to update the code:

1. Make changes to files on GitHub (edit directly or upload new versions)
2. Railway will automatically detect changes and redeploy
3. Takes about 1-2 minutes

---

## Security Notes

- Your API key is stored securely in Railway's encrypted environment variables
- It's never exposed in your code or to users
- Railway URLs are not guessable, but anyone with the link can use your app
- For extra security, you could add password protection (let me know if you want this)

---

## Questions?

The app is self-contained. If something breaks:
1. Check Railway logs for error messages
2. Verify your API key is correct
3. Make sure your Anthropic account has credits

Enjoy your Casefile research tool! 🎙️
