#!/usr/bin/env node

/**
 * Export Knack object_135 data to JSON file
 * Usage: node export-knack-data.js
 * 
 * Set environment variables:
 *   REACT_APP_KNACK_API_KEY = your_api_key
 *   REACT_APP_KNACK_APP_ID = your_app_id
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.REACT_APP_KNACK_API_KEY;
const APP_ID = process.env.REACT_APP_KNACK_APP_ID;

if (!API_KEY || !APP_ID) {
  console.error('❌ Missing environment variables:');
  console.error('   Set REACT_APP_KNACK_API_KEY and REACT_APP_KNACK_APP_ID');
  process.exit(1);
}

async function exportData() {
  console.log('📥 Exporting data from Knack object_135...');
  
  try {
    let allRecords = [];
    let pageNumber = 1;
    let hasMore = true;
    const batchSize = 250;

    while (hasMore) {
      console.log(`  ⏳ Fetching page ${pageNumber}...`);
      
      try {
        const response = await axios.get(
          'https://api.knack.com/v1/objects/object_135/records',
          {
            headers: {
              'X-Knack-REST-API-Key': API_KEY,
              'X-Knack-Application-Id': APP_ID,
              'Content-Type': 'application/json'
            },
            params: {
              rows_per_page: batchSize,
              page: pageNumber
            },
            timeout: 10000
          }
        );

        const records = response.data.records || [];
        
        if (records.length === 0) {
          hasMore = false;
        } else {
          allRecords = allRecords.concat(records);
          console.log(`  ✓ Page ${pageNumber}: ${records.length} records (total: ${allRecords.length})`);
          pageNumber++;
        }
      } catch (err) {
        console.error(`  ❌ Error on page ${pageNumber}:`, err.message);
        hasMore = false;
      }
    }

    // Save to file
    const dataDir = path.join(__dirname, 'public', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const filePath = path.join(dataDir, 'campaigns.json');
    const output = {
      exportedAt: new Date().toISOString(),
      recordCount: allRecords.length,
      records: allRecords
    };

    fs.writeFileSync(filePath, JSON.stringify(output, null, 2));

    console.log(`\n✅ SUCCESS!`);
    console.log(`📊 Exported ${allRecords.length} records`);
    console.log(`💾 Saved to: ${filePath}`);
    console.log(`📅 Exported at: ${output.exportedAt}`);
    console.log(`\n💡 Tip: Add public/data/campaigns.json to Git for deployment`);

  } catch (err) {
    console.error('❌ Fatal error:', err.message);
    process.exit(1);
  }
}

exportData();
