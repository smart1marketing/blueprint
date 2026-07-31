# ⚡ Quick Start (5 Minutes)

## Your Render is Ready! 

Render is already configured. You just need to:
1. Clean up GitHub
2. Push fresh code
3. Wait for auto-deploy

---

## Step 1: Get Knack Credentials

### API Key
- Knack App Settings > API & Webhooks
- Copy REST API Key

### Application ID
- Knack Builder URL: `https://builder.knack.com/app/[THIS]/...`
- Copy the ID

### Object ID
- Already set: `object_234`

---

## Step 2: Update GitHub

```bash
# In your local blueprint repo
cd blueprint

# Delete old (corrupted) folder
rm -rf knack-creative-lookup

# Extract new zip
unzip ~/knack-creative-lookup.zip

# Copy to repo
cp -r knack-creative-lookup .

# Commit & push
git add knack-creative-lookup/
git commit -m "Fix: Add corrected app (v3.0)"
git push origin main
```

---

## Step 3: Update Render (2 minutes)

1. Go to render.com dashboard
2. Click your service: `knack-creative-lookup`
3. Click **Settings** tab (right side)
4. Click **Environment** (left sidebar)
5. Click **Add Environment Variable**

Add 3 variables:
```
KEY                           VALUE
REACT_APP_KNACK_API_KEY      [your api key]
REACT_APP_KNACK_APP_ID       [your app id]
REACT_APP_KNACK_IO_OBJECT_ID object_234
```

6. Click **Save Changes**

---

## Step 4: Wait for Deploy

Render auto-deploys when it detects GitHub push.

1. Click **Deployments** tab
2. Should see new build in progress
3. Wait 2-5 minutes
4. Status changes to "Live" ✨

---

## Step 5: Test

1. Visit: `https://knack-creative-lookup.onrender.com`
2. Open browser console: **F12**
3. Check for:
   - ✅ No errors
   - ✅ Creatives loading
   - ✅ Dropdown works
4. Success! 🎉

---

## Troubleshooting

**Still seeing 401?**
- Double-check REACT_APP_KNACK_API_KEY in Render
- Double-check REACT_APP_KNACK_APP_ID in Render
- Make sure no typos
- Redeploy after updates

**Build failing?**
- Check Render Logs tab
- Verify package.json is valid
- Try manual deploy

**Questions?**
- See FIND_APP_ID.md for credentials
- See BUGFIX_LOG.txt for what was fixed
- See Knack_API_Integration_Guide.md for API details
