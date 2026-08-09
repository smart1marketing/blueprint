# 🚀 Deploy Guide

## Prerequisites

✅ GitHub repo set up
✅ Render account connected to GitHub
✅ Service created

## Deploy

### Step 1: Update Local Repo
```bash
cd knack-creative-lookup

# Get pre-built version
unzip knack-creative-lookup-v6-prebuilt.zip

# Or copy files manually:
# - Copy build/ folder
# - Copy render.yaml
# - Copy package.json
```

### Step 2: Commit
```bash
git add build/
git add render.yaml
git add package.json
git add .gitignore

git commit -m "v6.0: Pre-built, zero OOM"
git push origin main
```

### Step 3: Render Auto-Deploys
```
✓ Detects push
✓ Runs: npm install serve
✓ Runs: serve -s build -l 3000
✓ Service up (1-2 minutes)
```

### Step 4: Test
Visit: https://knack-creative-lookup.onrender.com

Expected:
- Loads in <1 second
- No errors
- All 10,491 campaigns available
- Dropdown works
- Filters work

## Troubleshooting

### "Cannot find build folder"
Make sure you committed the `build/` folder:
```bash
git status
# Should show: build/ (new folder)

git add build/
git push origin main
```

### "Service still crashing"
Clear Render cache and redeploy:
1. Render dashboard → Settings → Clear build cache
2. Manual deploy or push empty commit:
   ```bash
   git commit --allow-empty -m "Rebuild"
   git push origin main
   ```

### "Runs out of memory during deploy"
This shouldn't happen! Let me know if it does.
The `serve` package is tiny (~15 MB).

## Size Reference

```
build/           6.1 MB (pre-built app)
node_modules/    150 MB (install time only)
campaigns.json   5.5 MB (included in build)
Total runtime    50 MB (serve + static files)
```

Fits comfortably on Render free tier! ✅
