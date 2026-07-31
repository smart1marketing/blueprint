# 📋 Creative Lookup - Quick Reference Card

## 🎯 What This App Does
Searches your Knack Insertion Orders by date range + client, displays creative thumbnails, click to see full image.

## 🔧 Prerequisites
- [ ] Node.js 18+
- [ ] GitHub account
- [ ] Render account
- [ ] Knack API Key

---

## 📍 Key Files

| File | Purpose |
|------|---------|
| `App.jsx` | Main logic & state |
| `components/ImageModal.jsx` | Full-size image viewer |
| `.env.local` | Your API credentials |
| `package.json` | Dependencies |
| `README.md` | Full documentation |
| `SETUP_GUIDE.md` | Step-by-step setup |

---

## 🔐 Environment Variables

```bash
REACT_APP_KNACK_API_KEY=abc123xyz...
REACT_APP_KNACK_IO_OBJECT_ID=object_234
```

**Get API Key from:** Knack Settings > API & Webhooks

---

## 📝 Important Knack Fields

| Field Key | What It Is | Used For |
|-----------|-----------|----------|
| `field_2243` | Client Organization Name | Dropdown filter |
| `field_2234` | Date Created | Date range filter |
| `field_2264` | Uploaded Files | Images (customizable) |
| `field_2426` | IO # | Display in modal |
| `field_2233` | Campaign Name | Display in modal |
| `field_2254` | Status | Status badge |

---

## 💻 Local Development

```bash
# Install
npm install

# Create .env.local and add credentials
cp .env.example .env.local

# Run
npm start

# Visit: http://localhost:3000
```

---

## 🚀 Deploy to Render

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "msg"
   git push origin main
   ```

2. **Create Render service:**
   - Go to render.com
   - New Web Service → Select GitHub repo
   - Build: `npm install && npm run build`
   - Start: `npm start`

3. **Add secrets in Render:**
   - `REACT_APP_KNACK_API_KEY`
   - `REACT_APP_KNACK_IO_OBJECT_ID`

4. **Deploy!** ✨

---

## 🎨 Customization

| What | Where | How |
|-----|-------|-----|
| Colors | `App.css` | Change hex values |
| Thumbnail size | `App.css` `.creatives-grid` | Adjust `minmax(250px, 1fr)` |
| Image field | `App.jsx` line ~140 | Change `field_2264` |
| Filters | `App.jsx` | Add new state + UI |

---

## ❌ Troubleshooting

| Error | Fix |
|-------|-----|
| "Missing REACT_APP_KNACK_API_KEY" | Check `.env.local` exists |
| No records show | Verify API Key is correct |
| Images blank | Ensure `field_2264` has URLs |
| Render build fails | Check Render environment variables |

---

## 📱 Features

✅ Search clients (as you type)  
✅ Date range filter (start + end)  
✅ Thumbnail grid  
✅ Full-size image modal  
✅ Status badges  
✅ Responsive design  
✅ Mobile friendly  

---

## 🔄 Update Your App

Changes? Deploy:
```bash
git add .
git commit -m "update"
git push origin main
```

Render auto-deploys (2-5 min)

---

## 📊 Project Stats

- **React:** 18.2
- **Records:** 10,390+
- **Fields:** 207 total (202 active)
- **Deployment:** Render
- **Cost:** FREE tier available

---

## 🧠 How It Works (60 seconds)

1. App loads → Axios fetches all IO records from Knack
2. Extracts unique clients from `field_2243`
3. Shows dropdown, date filters
4. User selects → App filters records in JavaScript
5. Maps filtered records to creatives (if they have images)
6. Displays grid of thumbnails
7. Click thumbnail → Modal shows full image + details
8. Close modal → Back to grid

---

## 🎯 Common Customizations

### Add Status Filter
```javascript
// App.jsx
const [selectedStatus, setSelectedStatus] = useState(null);

// In filter logic:
if (selectedStatus && record.field_2254 !== selectedStatus) return false;
```

### Change Image Field
```javascript
// App.jsx line ~140
const imageUrl = 
  record.field_149 ||  // Upload Your Logo
  record.YOUR_FIELD || 
  null;
```

### Add Campaign Search
```javascript
// Add text input + filter:
if (searchText && !record.field_2233?.includes(searchText)) return false;
```

---

## 📚 Resources

| Topic | Link |
|-------|------|
| Knack API | https://docs.knack.com/docs/knack-api |
| React | https://react.dev |
| Render | https://render.com/docs |
| GitHub | https://docs.github.com |

---

## ⏱️ Timeline

| Task | Time |
|------|------|
| Get Knack credentials | 5 min |
| Setup locally | 10 min |
| Deploy to Render | 10 min |
| Test | 5 min |
| **Total** | **30 min** |

---

## ✅ Checklist - Before Going Live

- [ ] API Key works locally
- [ ] Images display in grid
- [ ] Filtering works (client + dates)
- [ ] Modal opens/closes
- [ ] Deployed to Render successfully
- [ ] Environment variables set in Render
- [ ] App loads at render.com URL
- [ ] Share link with team

---

## 🆘 Quick Support

**Stuck?** Check this order:
1. README.md (full docs)
2. SETUP_GUIDE.md (step-by-step)
3. ARCHITECTURE.md (how it works)
4. Render/Knack docs
5. Browser console (F12)

---

**Version:** 1.0 | **Updated:** July 2026
