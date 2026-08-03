# 🔄 Update: Object 135 Campaign/Product Records

## Overview

The Creative Lookup app has been **completely redesigned** to query **object_135** (Campaign/Product records) instead of object_234 (Insertion Orders).

---

## 🎯 What Changed

### **Data Source**
| Before | After |
|--------|-------|
| object_234 (IO records) | object_135 (Campaign/Product records) |
| 76 fields | 15+ specific fields |

### **Client Lookup**
| Before | After |
|--------|-------|
| field_2243 (IO Client Org) | field_2384 (Campaign Client) |
| Many duplicates | Auto-deduped, unique list |

### **Creative/Image Fields** (Priority Order)
```
1. field_2409  - Creative upload
2. field_2427  - Creative Pickup
3. field_3422  - External Creative Link 1
4. field_3425  - External Creative Link 2
5. field_3426  - External Creative Link 3
6. field_3427  - External Creative Link 4
```

### **Campaign Names**
```
field_2309  - IO Campaign Name (primary)
field_3340  - Product Campaign Name
field_3341  - Display Campaign Name
```

### **Date Filtering**
| Before | After |
|--------|-------|
| field_2234 (IO Date Created) | field_2313 (Start/End Date) |
| No default dates | Default: Start of month to today |

---

## 📋 All Supported Fields (object_135)

| Field ID | Field Name | Usage |
|----------|-----------|-------|
| field_2309 | IO Campaign Name | Display (primary campaign name) |
| field_3340 | Product Campaign Name | Display (alternate campaign name) |
| field_3341 | Display Campaign Name | Display (alternate campaign name) |
| field_2409 | Creative upload | Image/creative source (priority 1) |
| field_2427 | Creative Pickup | Image/creative source (priority 2) |
| field_3422 | External Creative Link 1 | Image/creative source + modal display |
| field_3425 | External Creative Link 2 | Image/creative source + modal display |
| field_3426 | External Creative Link 3 | Image/creative source + modal display |
| field_3427 | External Creative Link 4 | Image/creative source + modal display |
| field_2748 | Prod# - Creative Pickup | Metadata (available in data) |
| field_2327 | Product Text | Display in grid & modal |
| field_2469 | IO # | Display in grid & modal |
| field_2313 | Start Date / End Date | Date filtering + display |
| field_2300 | Status | Status badge display |
| field_2384 | Client lookup | Dropdown population (unique) |

---

## 🔍 What Stays the Same

✅ Authentication headers (API Key + App ID)
✅ UI/UX design (dropdown, date pickers, modal)
✅ Filtering logic (client + date range)
✅ Responsive design
✅ Accessibility features

---

## ⚙️ Environment Variables

**No new environment variables needed!**

Same 2 variables as before:
```
REACT_APP_KNACK_API_KEY = [your api key]
REACT_APP_KNACK_APP_ID = [your app id]
```

The app no longer requires `REACT_APP_KNACK_IO_OBJECT_ID` since it now hardcodes `object_135`.

---

## 📊 Default Behavior

### **On App Load**

1. **Fetches all records** from object_135
2. **Extracts unique clients** from field_2384
3. **Sets date range** to: Start of current month → Today
4. **Displays all campaigns** matching date range

### **Date Filtering**

```
Start Date: 1st of current month
End Date:   Today's date
Filter By:  field_2313 (Start/End Date)
```

Users can change these dates with the date pickers.

### **Client Dropdown**

```
Source:     field_2384 (Client lookup)
Unique:     Yes (duplicates removed)
Sorted:     Alphabetically
Searchable: Yes (with live search)
```

---

## 🔧 Code Changes

### **App.jsx**

**fetchIoRecords()** function:
- ✅ Changed to query object_135 hardcoded
- ✅ Removed REACT_APP_KNACK_IO_OBJECT_ID requirement
- ✅ Changed client field to field_2384
- ✅ Sets default dates on load
- ✅ Deduplicates client names

**Filter logic**:
- ✅ Uses field_2384 for client filtering
- ✅ Uses field_2313 for date filtering

**Creatives mapping**:
- ✅ Maps all 15+ fields
- ✅ Tries 6 creative/image fields in priority order
- ✅ Filters to only show records with clients

**CreativeCard component**:
- ✅ Uses ioCampaignName (field_2309)
- ✅ Shows productText (field_2327)
- ✅ Displays startDate (field_2313)
- ✅ Shows ioNumber (field_2469)

### **ImageModal.jsx**

**Detail view now shows**:
- ✅ All campaign names (IO, Product, Display)
- ✅ Client name
- ✅ IO number
- ✅ Start date
- ✅ Status
- ✅ Product text
- ✅ External creative links (1-4)

---

## 🚀 Deployment

### **GitHub**

```bash
cd blueprint
rm -rf knack-creative-lookup
unzip ~/knack-creative-lookup.zip
cp -r knack-creative-lookup .
git add knack-creative-lookup/
git commit -m "Update: Switch to object_135 (Campaign records)"
git push origin main
```

### **Render**

Render will auto-deploy (no config changes needed).

✅ Root Directory: knack-creative-lookup
✅ Build Command: npm install && npm run build
✅ Environment vars: 2 (same as before)

---

## ✅ Testing Checklist

After deployment:

```
□ Dropdown populates with clients (from field_2384)
□ No duplicate client names
□ Date pickers show start of month → today
□ Grid displays campaigns with creatives
□ Campaign name, IO #, date, status visible
□ Click creative → modal opens
□ Modal shows all campaign names
□ Modal shows product text
□ Modal shows external links (if any)
□ No console errors
□ Can filter by client
□ Can filter by date range
□ Reset button clears all filters
□ Responsive on mobile
```

---

## 🔄 Reverting (If Needed)

If you need to go back to object_234:

1. Replace `object_135` with `object_234` in App.jsx
2. Change field_2384 back to field_2243
3. Change field_2313 back to field_2234
4. Change field_2309 back to field_2233
5. Remove new campaign name fields
6. Redeploy

**Recommended:** Keep the old object_234 version saved separately.

---

## 📞 Support

If something doesn't look right:

1. **Check browser console** (F12) for errors
2. **Verify object_135 has data** with the records you expect
3. **Verify field IDs** match your Knack setup
4. **Check Render logs** for API errors
5. **Test API manually** with curl command

---

## 🎉 Summary

Your app now:
- ✅ Queries campaigns from object_135
- ✅ Defaults to current month's data
- ✅ Shows no duplicate clients
- ✅ Displays all campaign names & details
- ✅ Links to external creatives
- ✅ Maintains same great UX

**Ready to deploy!** 🚀
