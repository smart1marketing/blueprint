# 📸 Creative Lookup Tool

A web application to search, filter, and view creatives from your Knack Insertion Orders. Built with React and deployed on Render.

**Features:**
- 🔍 Searchable Client Organization dropdown
- 📅 Date range picker (start/end dates)
- 🖼️ Thumbnail grid with full-size image modal
- 📱 Fully responsive design
- ⚡ Real-time API integration with Knack

---

## Quick Start

### Prerequisites
- Node.js 18+ installed
- GitHub account
- Knack API Key and Object ID
- Render account (for deployment)

### 1. Local Development Setup

**Clone or fork this repository:**
```bash
git clone https://github.com/YOUR_USERNAME/knack-creative-lookup.git
cd knack-creative-lookup
```

**Install dependencies:**
```bash
npm install
```

**Configure environment variables:**
```bash
# Copy the example file
cp .env.example .env.local

# Edit .env.local with your Knack credentials
```

**Edit `.env.local`:**
```
REACT_APP_KNACK_API_KEY=your_api_key_here
REACT_APP_KNACK_IO_OBJECT_ID=object_234
```

**Find your Knack API Key:**
1. Log in to your Knack app
2. Go to Settings > API & Webhooks
3. Copy your REST API Key
4. Find your IO Object ID (e.g., `object_234`)

**Start the development server:**
```bash
npm start
```

Visit `http://localhost:3000` in your browser.

---

## Project Structure

```
knack-creative-lookup/
├── public/
│   └── index.html                 # HTML entry point
├── src/
│   ├── components/
│   │   ├── ImageModal.jsx         # Full-size image viewer
│   │   ├── ImageModal.css
│   │   ├── LoadingSpinner.jsx
│   │   └── LoadingSpinner.css
│   ├── App.jsx                    # Main app component
│   ├── App.css                    # App styles
│   ├── index.js                   # React entry point
│   └── index.css                  # Global styles
├── .env.example                   # Environment template
├── .gitignore
├── package.json
└── README.md
```

---

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REACT_APP_KNACK_API_KEY` | Yes | Your Knack REST API Key |
| `REACT_APP_KNACK_IO_OBJECT_ID` | Yes | Knack Insertion Order object ID (e.g., `object_234`) |
| `REACT_APP_IMAGE_FIELD` | No | Which field contains images (default: `field_2264`) |
| `REACT_APP_TITLE` | No | App title for display |

### Customizing Image Fields

By default, the app looks for images in `field_2264` (Uploaded Files). To use a different field:

**Edit `App.jsx` line ~140:**
```javascript
const imageUrl = 
  record.field_2264 ||  // Try this first
  record.field_149 ||   // Then this
  record.YOUR_CUSTOM_FIELD ||  // Add your field here
  null;
```

**Common Knack image fields:**
- `field_2264` - Uploaded Files (Insertion Order)
- `field_149` - Upload Your Logo (Client Org)
- `field_3080` - Logo (Partner)
- Custom fields with image URLs

---

## Usage

### 1. Search by Client Organization
- Type in the "Client Organization" dropdown
- Suggestions appear as you type
- Select a client to filter creatives

### 2. Filter by Date Range
- Click "Start Date" to pick a begin date
- Click "End Date" to pick an end date
- Results filter to show only records within the range
- Date format: MM/DD/YYYY

### 3. View Creatives
- Grid displays thumbnail images
- Hover over a thumbnail to see the expand icon
- Click to open full-size image modal

### 4. View Creative Details
- Full image appears on left
- Campaign details on right:
  - Campaign Name
  - Client Organization
  - IO Number
  - Date Created
  - Status (Complete, Live, Pending, Cancelled)
- Press ESC or click backdrop to close

### 5. Reset Filters
- Click "Reset Filters" button to clear all selections

---

## Deployment to Render

### Step 1: Push to GitHub

1. Create a new repository on GitHub
2. Push your code:
   ```bash
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/knack-creative-lookup.git
   git push -u origin main
   ```

### Step 2: Create Render Service

1. Go to [render.com](https://render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure the service:
   - **Name:** `knack-creative-lookup`
   - **Environment:** Node
   - **Build Command:** `npm install && npm run build`
   - **Start Command:** `npm start`
   - **Plan:** Free (for testing) or Starter (for production)

### Step 3: Set Environment Variables

1. In Render dashboard, go to your service
2. Click "Environment" tab
3. Add variables:
   ```
   REACT_APP_KNACK_API_KEY=your_api_key_here
   REACT_APP_KNACK_IO_OBJECT_ID=object_234
   ```
4. Click "Deploy"

### Step 4: Deploy

1. Click "Manual Deploy" or "Deploy Latest Commit"
2. Wait for build to complete (2-5 minutes)
3. Your app is live at: `https://knack-creative-lookup.onrender.com`

---

## API Integration Details

### Knack API Endpoint
```
GET https://api.knack.com/v1/objects/{object_id}/records
Headers:
  - X-Knack-REST-API-Key: {your_api_key}
  - Content-Type: application/json
```

### Field Mapping
| Field Key | Display Name | Used For |
|-----------|--------------|----------|
| `field_2243` | Client Organization Name | Dropdown filtering |
| `field_2234` | Date Created | Date range filtering |
| `field_2426` | IO # | Display in modal |
| `field_2233` | Campaign Name | Display in modal |
| `field_2254` | Status | Status badge |
| `field_2264` | Uploaded Files | Image source |

---

## Customization Guide

### Change Color Scheme

Edit `App.css` to customize colors:

```css
/* Primary brand color */
.app-container {
  background: linear-gradient(135deg, YOUR_COLOR_1 0%, YOUR_COLOR_2 100%);
}

/* Accent color */
.reset-button {
  background-color: YOUR_ACCENT_COLOR;
}
```

### Add More Filters

Edit `App.jsx` to add new filters:

```javascript
// Add state
const [customFilter, setCustomFilter] = useState(null);

// Add filter UI
<div className="filter-group">
  <label>Your New Filter</label>
  {/* Add filter component */}
</div>

// Add to filtering logic
if (customFilter && record.field_XXXX !== customFilter) {
  return false;
}
```

### Change Results Layout

Edit `.creatives-grid` in `App.css`:

```css
.creatives-grid {
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  /* Increase minmax value for larger cards */
}
```

---

## Troubleshooting

### "Missing REACT_APP_KNACK_API_KEY" Error
- ✅ Check `.env.local` file exists
- ✅ Verify variable names match exactly
- ✅ Restart dev server after changing `.env.local`

### No creatives showing
- ✅ Verify Knack API Key is correct
- ✅ Check Object ID matches your IO table
- ✅ Ensure records have image URLs in `field_2264`
- ✅ Check browser console for API errors

### Images not displaying
- ✅ Verify `field_2264` contains image URLs
- ✅ Check images are publicly accessible
- ✅ Adjust `field_2264` in `App.jsx` if images are in different field
- ✅ Check CORS policy if using external image URLs

### Render deployment fails
- ✅ Verify environment variables are set in Render
- ✅ Check GitHub connection is authorized
- ✅ Review Render build logs for errors
- ✅ Ensure Node 18+ is specified in build

### Dates not filtering correctly
- ✅ Verify date format is MM/DD/YYYY
- ✅ Check `field_2234` exists in your records
- ✅ Ensure dates are properly formatted in Knack

---

## Performance Tips

1. **Limit Records Fetched**
   - Add pagination in `App.jsx`:
   ```javascript
   params: {
     rows_per_page: 1000,  // Load 1000 at a time instead of all
   }
   ```

2. **Image Optimization**
   - Use thumbnails < 500KB
   - Consider using CDN/image optimization service
   - Lazy load images on scroll

3. **Caching**
   - Add caching headers to Knack API calls
   - Implement local storage for client list

---

## Support & Resources

- **Knack API Docs:** https://docs.knack.com/docs/knack-api
- **React Documentation:** https://react.dev
- **Render Deployment:** https://render.com/docs
- **Issues:** Create an issue on your GitHub repository

---

## License

This project is open source and available under the MIT License.

---

## Field Reference

For a complete list of Knack field keys and their meanings, see:
- `Knack_API_Field_Reference.xlsx` - All tables
- `IO_Product_Live_Fields.xlsx` - Actual IO/Product field usage

---

**Last Updated:** July 2026  
**Version:** 1.0.0
