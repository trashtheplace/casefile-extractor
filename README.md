# Casefile Extractor

A simple web app to extract characters, locations, pronouns, and images from Casefile podcast episodes.

![Screenshot placeholder]

## What It Does

1. You paste a Casefile episode URL
2. It scrapes the episode page and all linked sources
3. Claude extracts the main people, locations, and finds relevant images
4. You get a nice display with:
   - **People** (victims, suspects, investigators) with pronouns
   - **Locations** (crime scenes, key places)
   - **Images** matched to each entity
   - **Download** options for all images

---

## Setup (One Time)

### Step 1: Install Node.js

If you don't have Node.js installed:

- **Mac**: Download from [nodejs.org](https://nodejs.org/) (choose LTS version)
- **Windows**: Download from [nodejs.org](https://nodejs.org/) (choose LTS version)

To check if it's installed, open Terminal (Mac) or Command Prompt (Windows) and type:
```bash
node --version
```
You should see a version number like `v20.x.x`

### Step 2: Download This App

Download all the files in this folder to your computer. Put them in a folder like `casefile-extractor`.

### Step 3: Add Your API Key

1. Copy the file `.env.local.example` and rename it to `.env.local`
2. Open `.env.local` in any text editor
3. Replace `sk-ant-your-key-here` with your actual Anthropic API key
4. Save the file

**To get an API key:**
1. Go to [console.anthropic.com](https://console.anthropic.com/)
2. Sign up or log in
3. Go to API Keys
4. Create a new key
5. Copy it (starts with `sk-ant-`)

### Step 4: Install Dependencies

Open Terminal/Command Prompt, navigate to your folder, and run:

```bash
cd path/to/casefile-extractor
npm install
```

This downloads the required code libraries. Only needed once.

---

## Running the App

Every time you want to use it:

```bash
cd path/to/casefile-extractor
npm run dev
```

Then open your browser to: **http://localhost:3000**

To stop: Press `Ctrl+C` in the terminal.

---

## How to Use

1. Go to http://localhost:3000
2. Paste a Casefile episode URL, like:
   ```
   https://casefilepodcast.com/case-104-silk-road-part-1/
   ```
3. Click **Extract**
4. Wait 30-60 seconds while it:
   - Fetches the episode page
   - Crawls source links
   - Analyzes with Claude
5. See your results:
   - Click any image to see it larger
   - Click **Download** to save individual images
   - Click **Download All Images** to get them all
   - Click **Export JSON** to save the structured data

---

## Output

For each entity (person or location) you get:

| Field | Description |
|-------|-------------|
| **Name** | Full name |
| **Type** | Person or Location |
| **Role** | victim, suspect, investigator, etc. |
| **Pronouns** | he/him, she/her, they/them (when stated in sources) |
| **Description** | 1-2 sentence summary from the sources |
| **Images** | Relevant photos from the sources |

Each image includes:
- The image itself
- Where it came from (attribution)
- Why it's relevant to that entity
- Any people shown, dates, locations (when stated)

---

## Cost

Each episode analysis uses one Claude API call:
- ~$0.02–0.05 per episode (Claude Sonnet pricing)
- A typical month of use might cost $1–5

---

## Troubleshooting

**"ANTHROPIC_API_KEY not configured"**
- Make sure you created `.env.local` (not `.env.local.example`)
- Make sure the key is correct and starts with `sk-ant-`
- Restart the app after changing the file

**"Failed to fetch episode"**
- Check that the URL is correct
- Make sure you have internet connection
- Some pages may block automated requests

**Images not loading**
- Some sites block image hotlinking
- Click "Open Original" to see the image on its source site
- Download works even if preview doesn't

**App won't start**
- Make sure you ran `npm install` first
- Check that Node.js is installed (`node --version`)

---

## Files Explained

```
casefile-extractor/
├── app/
│   ├── page.tsx           # The main web page
│   ├── globals.css        # Styling
│   ├── layout.tsx         # Page wrapper
│   └── api/
│       ├── analyze/       # Does the scraping + AI
│       └── download/      # Downloads images
├── package.json           # Dependencies list
├── .env.local             # Your API key (create this)
└── README.md              # This file
```

---

## Privacy & Attribution

- Images are loaded directly from their sources
- Attribution (source website) is shown for every image
- Downloaded images include source information
- This is for personal/research use
