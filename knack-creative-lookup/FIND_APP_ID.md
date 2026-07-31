# 🔍 How to Find Your Knack Application ID

## Method 1: From Your Knack Builder URL (EASIEST)

1. **Open your Knack app in the builder**
2. **Look at the URL in your browser:**
   ```
   https://builder.knack.com/app/XXXXXXXXXX/...
                              ^^^^^^^^^^
   ```
3. **Copy the value between `/app/` and `/data`**

### Example:
```
URL: https://builder.knack.com/app/5f8c2e9d4b3a1c7e/data/object/234
APP ID: 5f8c2e9d4b3a1c7e
```

---

## Format Check

Your Application ID should:
- ✓ Be 15+ characters long
- ✓ Contain letters and numbers
- ✓ Look like: `5f8c2e9d4b3a1c7e`
- ✓ NOT start with "object_"
- ✓ NOT start with "field_"

---

## Once You Have It

1. Go to Render dashboard
2. Your service: `knack-creative-lookup`
3. Click **Settings** > **Environment**
4. Add: `REACT_APP_KNACK_APP_ID = [your app id]`
5. Click Save
6. App auto-redeploys ✨

---

## Verify It Works

1. Visit your app URL: `https://knack-creative-lookup.onrender.com`
2. Open browser console: Press **F12**
3. Look for:
   - ✅ Creatives loading
   - ✅ No 401 errors
   - ✅ Dropdown working
4. Success! 🎉
