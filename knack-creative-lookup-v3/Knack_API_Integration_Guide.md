# Knack API Integration Guide
**Based on live data from 10,390 IO/Product records**

---

## Quick Start

### Base URL
```
https://api.knack.com/v1/objects/{object_key}/records
```

### Required Headers
```
Content-Type: application/json
X-Knack-REST-API-Key: YOUR_API_KEY
```

---

## Field Key Mapping (IO/Product Records)

| API Field Key | Display Name | Usage |
|---|---|---|
| `field_2426` | IO # | Primary identifier |
| `field_2243` | Client Organization Name | 100% populated - use for filtering |
| `field_2237` | Media Partner Name | 100% populated - use for filtering |
| `field_2254` | Status | Core tracking field |
| `field_2234` | Date Created | 100% populated - great for date range queries |
| `field_2305` | [Date field] | 100% populated |
| `field_2543` | [Numeric field] | 100% populated (integers) |
| `field_2640` | Product Code | 100% populated (e.g., "p100") |
| `field_2796` | Total Cost | 100% populated (dollar amounts with formatting) |

---

## Common API Calls

### 1. Fetch All IO Records
```javascript
fetch('https://api.knack.com/v1/objects/object_123/records', {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
    'X-Knack-REST-API-Key': 'YOUR_API_KEY'
  }
})
.then(r => r.json())
.then(data => console.log(data.records))
```

**Response Structure:**
```json
{
  "records": [
    {
      "id": "64774b27e66b290027a4228a",
      "field_2426": "IO-12345",
      "field_2243": "General Motors",
      "field_2237": "Circle City Broadcasting",
      "field_2254": "Complete",
      "field_2305": "05/31/2023",
      "field_2640": "p100",
      "field_2796": "$2,640.31",
      "field_2543": 100,
      ...
    }
  ]
}
```

---

### 2. Filter by Client Organization
```javascript
const filters = [{
  "field": "field_2243",  // Client Organization Name
  "operator": "is",
  "value": "General Motors"
}];

const query = new URLSearchParams();
query.append('where', JSON.stringify(filters));

fetch(`https://api.knack.com/v1/objects/object_123/records?${query}`, {
  headers: {
    'X-Knack-REST-API-Key': 'YOUR_API_KEY'
  }
})
```

---

### 3. Filter by Status
```javascript
const filters = [{
  "field": "field_2254",  // Status
  "operator": "is",
  "value": "Complete"
}];
```

**Common Status Values:** `Complete`, `Live`, `Pending`, `Cancelled`

---

### 4. Filter by Date Range
```javascript
const filters = [{
  "field": "field_2234",  // Date Created
  "operator": "is after",
  "value": "07/01/2023"
}, {
  "field": "field_2234",
  "operator": "is before",
  "value": "08/31/2023"
}];
```

---

### 5. Create New IO Record
```javascript
const newRecord = {
  "field_2426": "IO-99999",          // IO #
  "field_2243": "New Client",        // Client Organization Name
  "field_2237": "New Partner",       // Media Partner Name
  "field_2234": "07/27/2023",        // Date Created
  "field_2254": "Pending",           // Status
  "field_2245": "Contact Name",      // Client Name
  "field_2246": "email@example.com", // Client Email
  "field_2249": "Campaign objectives here", // Campaign Goals
  "field_2640": "p100"               // Product Code
};

fetch('https://api.knack.com/v1/objects/object_123/records', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Knack-REST-API-Key': 'YOUR_API_KEY'
  },
  body: JSON.stringify(newRecord)
})
```

---

### 6. Update Existing Record
```javascript
const recordId = "64774b27e66b290027a4228a";
const updates = {
  "field_2254": "Live",              // Update Status to Live
  "field_2796": "$5,280.62"          // Update Total Cost
};

fetch(`https://api.knack.com/v1/objects/object_123/records/${recordId}`, {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    'X-Knack-REST-API-Key': 'YOUR_API_KEY'
  },
  body: JSON.stringify(updates)
})
```

---

### 7. Delete Record
```javascript
const recordId = "64774b27e66b290027a4228a";

fetch(`https://api.knack.com/v1/objects/object_123/records/${recordId}`, {
  method: 'DELETE',
  headers: {
    'X-Knack-REST-API-Key': 'YOUR_API_KEY'
  }
})
```

---

## Data Format Notes

### Dates
- **Format:** `MM/DD/YYYY` (e.g., `07/31/2023`)
- **Field Examples:** `field_2234`, `field_2305`, `field_2946`
- **100% populated** in most records

### Currency/Money
- **Format:** `$X,XXX.XX` (string with formatting)
- **Field Examples:** `field_2796` (Total Cost), `field_3206` (another cost field)
- **Note:** Always comes as formatted string in API response

### Numbers
- **Format:** Plain integers or decimals
- **Field Examples:** `field_2543` (100), `field_2576` (4), `field_2580` (2023)
- **100% populated** in key tracking fields

### Yes/No Fields
- **Values:** `"Yes"` or `"No"` (strings)
- **Field Examples:** `field_2346`, `field_2883`
- **100% populated** in many records

### Connection Fields
- **API Response:** Shows as HTML span with connection ID
- **Raw Response:** Available in `field_XXXX_raw` with array of objects
- **Example:** Media Partner reference shows as both display (HTML) and raw ID

---

## Connection Fields (Relationships)

When a field references another table, the API returns:

**Display Version** (in field_XXXX):
```html
<span class="650c7792090ff00027275ea3" data-kn="connection-value">Digital TV</span>
```

**Raw Version** (in field_XXXX_raw):
```json
[{
  "id": "650c7792090ff00027275ea3",
  "identifier": "Digital TV"
}]
```

---

## Field Data Completeness

### 100% Populated Fields (Always Have Data)
- `field_2305` - Key date field
- `field_2543` - Key numeric field
- `field_2640` - Product code
- `field_2796` - Total cost
- `field_2798` - Related cost
- `field_2859` - Concatenated identifier
- `field_2883` - Yes/No field
- `field_2885-2892` - Status/count fields

### Frequently Empty
- `field_2310` - Optional notes
- `field_2332` - Optional field
- `field_2334-2337` - Optional fields
- `field_2347` - Optional field
- `field_2812` - Sometimes empty

---

## Zapier/Make Integration Tips

1. **Use 100% populated fields for filtering** - They'll always have values
2. **API Field Keys in Zapier** - When Zapier asks for "field mapping," use `field_2426`, not the display name
3. **Dates** - Use `MM/DD/YYYY` format when setting values
4. **Currency** - Include the $ and formatting when updating money fields
5. **Connection fields** - Zapier will show the display version; use the ID from `_raw` for direct API calls

---

## n8n Workflow Example

```json
{
  "nodes": [
    {
      "name": "Get IO Records",
      "type": "http",
      "typeVersion": 4.1,
      "position": [250, 300],
      "parameters": {
        "url": "https://api.knack.com/v1/objects/object_123/records",
        "method": "GET",
        "headers": {
          "X-Knack-REST-API-Key": "YOUR_API_KEY"
        }
      }
    },
    {
      "name": "Filter Complete IOs",
      "type": "n8n-nodes-base.itemLists",
      "position": [450, 300],
      "parameters": {
        "operation": "filter",
        "conditions": {
          "options": [{
            "key": "field_2254",
            "condition": "equals",
            "value": "Complete"
          }]
        }
      }
    }
  ]
}
```

---

## Webhook Payload Example

When Knack sends a webhook for a new/updated IO record:

```json
{
  "timestamp": 1692086400000,
  "action": "update",
  "object": "insertion_order",
  "recordId": "64774b27e66b290027a4228a",
  "data": {
    "field_2426": "IO-12345",
    "field_2243": "General Motors",
    "field_2254": "Live",
    "field_2234": "07/01/2023",
    "field_2796": "$2,640.31",
    "field_2543": 100,
    ...
  }
}
```

---

## Rate Limiting & Performance

- **Batch operations:** Use POST to create multiple records in sequence
- **Large pulls:** Consider date filtering to limit result sets
- **Typical response:** 10,390 total records available
- **Fields per record:** 202 active fields in live data

---

## Troubleshooting

| Error | Cause | Solution |
|---|---|---|
| `Invalid API Key` | Missing/wrong `X-Knack-REST-API-Key` | Check your API key in Knack Settings > API |
| `Field not found` | Using display name instead of field key | Use `field_2426`, not "IO #" |
| `400 Bad Request` | Malformed JSON or filter | Validate JSON syntax; check filter structure |
| `404 Not Found` | Wrong object_key or record ID | Verify object exists; check record ID |
| `Date format error` | Wrong date format in filter/update | Use `MM/DD/YYYY` format |

---

## Resources

- **Knack API Docs:** https://docs.knack.com/docs/knack-api
- **Your Database Field Reference:** `Knack_API_Field_Reference.xlsx`
- **Live Field Analysis:** `IO_Product_Live_Fields.xlsx`
- **API Base URL:** `https://api.knack.com/v1`

---

*Last updated: Based on analysis of 10,390 IO/Product records with 202 active fields*
