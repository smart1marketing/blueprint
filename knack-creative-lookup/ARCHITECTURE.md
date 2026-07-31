# 🏗️ Creative Lookup - Architecture Guide

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        YOUR BROWSER                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐  │
│  │         React App (knack-creative-lookup)          │  │
│  │                                                     │  │
│  │  ┌───────────────────────────────────────────────┐ │  │
│  │  │ App Component (State Management)              │ │  │
│  │  │ - ioRecords (loaded records)                  │ │  │
│  │  │ - clients (unique client list)                │ │  │
│  │  │ - selectedClient, startDate, endDate (filters)│ │  │
│  │  └───────────────────────────────────────────────┘ │  │
│  │                         ↓                          │  │
│  │  ┌───────────────────────────────────────────────┐ │  │
│  │  │ Render UI Components                          │ │  │
│  │  │ - Filters (Client dropdown, Date pickers)     │ │  │
│  │  │ - CreativeCard (Thumbnails grid)              │ │  │
│  │  │ - ImageModal (Full-size viewer)               │ │  │
│  │  └───────────────────────────────────────────────┘ │  │
│  │                                                     │  │
│  └─────────────────────────────────────────────────────┘  │
│                         ↓                                  │
└─────────────────────────────────────────────────────────────┘
                         ↓
            ┌────────────────────────────┐
            │   AXIOS HTTP REQUEST       │
            │  (REST API Call to Knack)  │
            └────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│                      KNACK SERVER                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  GET /v1/objects/object_234/records                        │
│  Headers:                                                   │
│    - X-Knack-REST-API-Key: [your_api_key]                 │
│                                                             │
│  Response: {                                                │
│    "records": [                                             │
│      {                                                      │
│        "id": "64774b27e66b290027a4228a",                  │
│        "field_2243": "General Motors",     // Client Org  │
│        "field_2234": "07/01/2023",         // Date Created│
│        "field_2426": "IO-12345",           // IO #        │
│        "field_2233": "Campaign Name",      // Campaign    │
│        "field_2264": "https://...",        // Image URL   │
│        "field_2254": "Complete"            // Status      │
│        ...more fields...                                   │
│      },                                                     │
│      ...10,389 more records...                             │
│    ]                                                        │
│  }                                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagram

```
[App Loads]
    ↓
[useEffect: fetchIoRecords()]
    ↓
[Axios → Knack API]
    ↓
[10,390 records stored in state]
    ↓
[Extract unique clients from field_2243]
    ↓
[Display Client dropdown + Date filters]
    ↓
[User interacts with filters]
    ↓
[filteredRecords = apply filter logic]
    ↓
[creatives = map records to {id, client, image, ...}]
    ↓
[Render <CreativeCard> for each creative]
    ↓
[User clicks thumbnail]
    ↓
[<ImageModal> shows full image + details]
    ↓
[User can open in new tab or close]
```

---

## Component Hierarchy

```
App (Main)
├── Header
├── Filters Section
│   ├── Client Dropdown (React-Select)
│   ├── Start Date Picker (React-DatePicker)
│   ├── End Date Picker (React-DatePicker)
│   └── Reset Button
├── Loading Spinner (conditional)
├── Error Message (conditional)
├── Empty State (conditional)
└── Results Section
    └── Creatives Grid
        └── CreativeCard (repeated)
            ├── Thumbnail Image
            ├── Campaign Name
            ├── Client Organization
            ├── IO Number
            ├── Date
            └── Status Badge
                
[ImageModal] (Portal)
├── Backdrop
├── Modal Content
│   ├── Close Button
│   ├── Image (Left side)
│   └── Details Panel (Right side)
│       ├── Campaign Name
│       ├── Client
│       ├── IO Number
│       ├── Date
│       ├── Status
│       └── Action Buttons
```

---

## State Management

### App-Level State
```javascript
// Data from API
const [ioRecords, setIoRecords] = useState([]);        // All 10,390 records
const [clients, setClients] = useState([]);             // Unique client list

// User Filters
const [selectedClient, setSelectedClient] = useState(null);
const [startDate, setStartDate] = useState(null);
const [endDate, setEndDate] = useState(null);
const [searchInput, setSearchInput] = useState('');

// UI State
const [loading, setLoading] = useState(false);
const [error, setError] = useState(null);
const [selectedImage, setSelectedImage] = useState(null);
const [isModalOpen, setIsModalOpen] = useState(false);
```

### Derived State (Computed)
```javascript
// Filtered records based on selections
const filteredRecords = ioRecords.filter(record => {
  if (selectedClient && record.field_2243 !== selectedClient.value) return false;
  if (startDate && isBefore(recordDate, startDate)) return false;
  if (endDate && isAfter(recordDate, endDate)) return false;
  return true;
});

// Creatives (filtered records with images)
const creatives = filteredRecords.map(record => ({
  id: record.id,
  clientName: record.field_2243,
  campaignName: record.field_2233,
  dateCreated: record.field_2234,
  ioNumber: record.field_2426,
  imageUrl: record.field_2264,
  status: record.field_2254,
  record: record
})).filter(creative => creative.imageUrl);
```

---

## API Integration Layer

### Knack API Call
```javascript
const fetchIoRecords = async () => {
  const apiKey = process.env.REACT_APP_KNACK_API_KEY;
  const objectId = process.env.REACT_APP_KNACK_IO_OBJECT_ID;
  
  const response = await axios.get(
    `https://api.knack.com/v1/objects/${objectId}/records`,
    {
      headers: {
        'X-Knack-REST-API-Key': apiKey,
        'Content-Type': 'application/json'
      },
      params: {
        rows_per_page: 10000
      }
    }
  );
  
  return response.data.records;
};
```

### Field Mapping
```javascript
// These Knack fields are used:

field_2243    // Client Organization Name     → Dropdown filter
field_2234    // Date Created                 → Date filter
field_2426    // IO #                         → Display
field_2233    // Campaign Name                → Display + Search
field_2254    // Status                       → Badge (Complete/Live/Pending/Cancelled)
field_2264    // Uploaded Files               → Image URLs
field_2237    // Media Partner Name           → Optional display
field_2245    // Client Name                  → Optional display
field_2246    // Client Email                 → Optional display
```

---

## Filtering Logic

### Step 1: Fetch
```
Knack API → 10,390 IO Records
```

### Step 2: Extract Clients
```
Loop through all records
Extract unique values from field_2243
Sort alphabetically
→ ["Acme Corp", "Best Inc", "General Motors", ...]
```

### Step 3: User Selects Filters
```
Client: "General Motors"
Start Date: 2023-07-01
End Date: 2023-08-31
```

### Step 4: Filter Records
```
For each record:
  - Does field_2243 match "General Motors"?
  - Is field_2234 >= 2023-07-01?
  - Is field_2234 <= 2023-08-31?
  - If all true: include in filteredRecords
  - If false: skip
```

### Step 5: Map to Creatives
```
For each filtered record:
  - Extract image from field_2264
  - If image URL exists: add to creatives array
  - Display in grid
```

### Step 6: Display
```
Render thumbnails in grid
→ User hovers/clicks
→ ImageModal opens
→ Shows full image + details
```

---

## User Interactions

### 1. Search Client Dropdown
```
User Types: "gene"
↓
Filter clients array by input
↓
Show matching suggestions: ["General Motors"]
↓
User clicks suggestion
↓
setSelectedClient({ label: "General Motors", value: "General Motors" })
↓
Component re-renders with filtered results
```

### 2. Select Date Range
```
User Clicks: "Start Date"
↓
DatePicker opens
↓
User selects: July 1, 2023
↓
setStartDate(new Date(2023, 6, 1))
↓
Component filters by start date
```

### 3. Click Image Thumbnail
```
User Clicks: Creative thumbnail
↓
handleImageClick(creative)
↓
setSelectedImage(creative)
↓
setIsModalOpen(true)
↓
<ImageModal> renders with full image + details
```

### 4. Close Modal
```
User Presses: ESC key OR clicks backdrop OR clicks Close
↓
handleKeyDown() OR handleBackdropClick() OR button onClick
↓
setIsModalOpen(false)
↓
setSelectedImage(null)
↓
Modal disappears
```

---

## Performance Considerations

### Current (Simple Approach)
```
1. Load all 10,390 records once
2. Filter in JavaScript
3. Display filtered results
```

**Pros:** Simple, no backend calls needed, instant filtering  
**Cons:** Slow if 100K+ records

### Optimized Approach (If Needed)
```
1. Implement pagination (load 1,000 at a time)
2. Add server-side filtering via Knack API filters
3. Implement lazy loading for images
4. Add caching layer
```

---

## Styling Architecture

### CSS Structure
```
index.css               → Global styles, resets
App.css                 → Layout, filters, grid
ImageModal.css          → Modal styles
LoadingSpinner.css      → Spinner animation

Colors:
  Primary: #3b82f6 (Blue)
  Gray: #6b7280
  Success: #22c55e (Green)
  Warning: #f59e0b (Amber)
  Danger: #ef4444 (Red)
  Background: #f9fafb
```

### Responsive Breakpoints
```
Mobile:    < 640px
Tablet:    640px - 768px
Desktop:   > 768px

Grid:
  Desktop: 4-5 columns (250px each)
  Tablet:  2-3 columns
  Mobile:  2 columns (150px)
```

---

## Deployment Architecture

```
GitHub Repository
  ↓
Render.com
  ├─ Detects push to main branch
  ├─ Runs build: npm install && npm run build
  ├─ Creates optimized /build folder
  ├─ Serves static files
  └─ Your app is live at https://knack-creative-lookup.onrender.com
```

### Environment
```
Render Node Runtime
├─ Node 18.x
├─ npm dependencies installed
├─ Environment variables loaded
└─ Static site served
```

---

## Security

### API Key Protection
```
✓ API Key stored in .env.local (local dev)
✓ API Key stored in Render secrets (production)
✗ API Key NEVER committed to git (.gitignore)
✗ API Key NEVER exposed in client code
```

### Note
For production, consider:
- Adding a backend proxy to hide API key
- Implementing request validation
- Adding rate limiting

---

## Troubleshooting Flowchart

```
Is the app loading?
├─ NO → Check .env.local file exists
├─ YES ↓
  Are records showing?
  ├─ NO → Check API Key in Render secrets
  ├─ YES ↓
    Are images visible?
    ├─ NO → Check field_2264 has URLs in your data
    ├─ YES ↓
      Is filtering working?
      ├─ NO → Check date format (MM/DD/YYYY)
      └─ YES → ✓ All working!
```

---

**See also:** README.md, SETUP_GUIDE.md
