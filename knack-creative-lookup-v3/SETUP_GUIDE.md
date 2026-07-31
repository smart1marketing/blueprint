# 🚀 Creative Lookup - Quick Setup Guide

## What You'll Build
A searchable creative gallery that queries your Knack database by date and client.

```
[Client Dropdown] [Start Date] [End Date] [Reset]
        ↓
   [Query Knack API]
        ↓
   [Display Thumbnails]
        ↓
   [Click → Full Image Modal]
```

---

## Prerequisites Checklist
- [ ] Node.js 18+ installed (`node --version`)
- [ ] GitHub account (free)
- [ ] Render account (free)
- [ ] Knack API Key (5 min to get)

---

## Step 1: Get Your Knack Credentials (5 min)

1. **Log into your Knack app**
2. **Settings → API & Webhooks**
3. **Copy your REST API Key** (keep this safe!)
4. **Note your Insertion Order Object ID**
   - Usually starts with `object_` (e.g., `object_234`)
   - Check your app's API docs or ask your Knack admin

**Save these somewhere safe - you'll need them in Step 4.**

---

## Step 2: Download Project Files

**Option A: Fork on GitHub (Recommended)**
```bash
# Go to: https://github.com/YOUR_USERNAME
# Create new repo from template or manual upload

# Then clone locally:
git clone https://github.com/YOUR_USERNAME/knack-creative-lookup.git
cd knack-creative-lookup
```

**Option B: Manual Download**
- Download all files from this project
- Create folder: `knack-creative-lookup/`
- Unzip files into that folder

---

## Step 3: Install & Test Locally (10 min)

```bash
# Install dependencies
npm install

# Create .env.local file
cp .env.example .env.local

# Edit .env.local and add:
# REACT_APP_KNACK_API_KEY=your_key_here
# REACT_APP_KNACK_IO_OBJECT_ID=object_234

# Start dev server
npm start
```

**Browser opens at `http://localhost:3000`**

Test the app:
- Type a client name in dropdown (suggestions appear)
- Pick start/end dates
- See thumbnails load

If it works → Great! Move to Step 4
If it fails → Check console errors, verify API Key is correct

---

## Step 4: Deploy to Render (10 min)

### 4a. Push to GitHub
```bash
git add .
git commit -m "Creative Lookup App"
git push origin main
```

### 4b. Connect Render
1. **Go to [render.com](https://render.com)**
2. **Sign up** (GitHub auth is easiest)
3. **Click "New +" → "Web Service"**
4. **Select your GitHub repo**
5. **Configure:**
   - Name: `knack-creative-lookup`
   - Environment: `Node`
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Plan: `Free` (to start)

### 4c. Add Secrets
1. **Environment tab** in Render
2. **Add these variables:**
   ```
   REACT_APP_KNACK_API_KEY = [your API key from Step 1]
   REACT_APP_KNACK_IO_OBJECT_ID = object_234
   ```
3. **Click "Deploy"**

**Wait 2-5 minutes for build...**

Your app is now live at: `https://knack-creative-lookup.onrender.com`

---

## Step 5: Update Your App

Made changes locally? Deploy them:

```bash
git add .
git commit -m "Updated filters"
git push origin main
```

**Render auto-deploys** - your live site updates in 2-5 min ✨

---

## File Structure (What Goes Where)

```
src/
├── App.jsx              ← Main search/filter logic
├── App.css              ← Styling for app
├── components/
│   ├── ImageModal.jsx   ← Full-size image viewer
│   ├── ImageModal.css
│   ├── LoadingSpinner.jsx
│   └── LoadingSpinner.css
└── index.js             ← Entry point
```

---

## Common Customizations

### Change Thumbnail Size
**App.css** → Find `.creatives-grid` → Adjust `minmax(250px, 1fr)`

### Add Status Filter
**App.jsx** → Add state + dropdown

### Change App Title
**render.yaml** → Update `REACT_APP_TITLE`

### Use Different Image Field
**App.jsx** → Line ~140 → Change `field_2264` to your field

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "API Key missing" | Check `.env.local` file exists |
| No creatives show | Verify API Key is correct, check Knack object ID |
| Images blank | Ensure `field_2264` has image URLs, or change field |
| Render build fails | Check environment variables are set in Render dashboard |
| Dates won't filter | Ensure date format MM/DD/YYYY |

---

## What's Running?

- **Frontend:** React 18 (your browser)
- **Backend:** Knack API (your data)
- **Hosting:** Render (your live app)

All data stays in Knack. This app just displays it nicely.

---

## Next Steps

1. ✅ Verify it works
2. ✅ Share link with team
3. ✅ Customize colors/layout as needed
4. ✅ Add more filters (status, partner, etc.)
5. ✅ Monitor Render dashboard

---

## Need Help?

- **Knack API:** https://docs.knack.com/docs/knack-api
- **React:** https://react.dev
- **Render:** https://render.com/docs
- **GitHub:** https://docs.github.com

Good luck! 🚀

---

**Estimated Total Time:** ~30-45 minutes from start to live app
