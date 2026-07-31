# 🔍 How to Find Your Knack Application ID

## Method 1: From Your Knack Builder URL (EASIEST)

1. **Open your Knack app in the builder**
2. **Look at the URL in your browser:**
   ```
   https://builder.knack.com/app/XXXXXXXXXX/...
                              ^^^^^^^^^^
   ```
3. **Copy the value between `/app/` and `/`**

### Example:
```
URL: https://builder.knack.com/app/123abc456def789/data/object/234
APP ID: 123abc456def789
```

---

## Method 2: From Knack Settings

1. **In your Knack app → Settings**
2. **Look for "API & Webhooks" section**
3. **Look for "Application ID"** (sometimes listed here)

---

## Method 3: From API Response

Run this in terminal (replace YOUR_API_KEY):
```bash
curl -H "X-Knack-REST-API-Key: YOUR_API_KEY" \
  https://api.knack.com/v1/applications
```

Look for your app in the JSON response.

---

## ✅ Format Check

Your Application ID should:
- ✓ Be a long string (15+ characters)
- ✓ Contain letters and numbers
- ✓ Look like: `123abc456def789`
- ✓ NOT start with "object_"
- ✓ NOT start with "field_"

---

## 🎯 Once You Have It

1. Add to Render environment variables:
   ```
   REACT_APP_KNACK_APP_ID = [your app id]
   ```
2. Redeploy
3. App should work! ✨
