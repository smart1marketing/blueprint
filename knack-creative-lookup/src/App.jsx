import React, { useState, useEffect, useMemo } from 'react';
import DatePicker from 'react-datepicker';
import Select from 'react-select';
import { parseISO, isAfter, isBefore } from 'date-fns';
import ImageModal from './components/ImageModal';
import LoadingSpinner from './components/LoadingSpinner';
import './App.css';
import 'react-datepicker/dist/react-datepicker.css';

const App = () => {
  // State
  const [ioRecords, setIoRecords] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [selectedCreative, setSelectedCreative] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  // Initialize - Load data from JSON file
  useEffect(() => {
    loadDataFromFile();
  }, []);

  const loadDataFromFile = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('📥 Loading campaigns data from file...');
      
      // Load JSON file from public/data/campaigns.json
      const response = await fetch('/data/campaigns.json');
      
      if (!response.ok) {
        throw new Error(`Failed to load data file: ${response.statusText}`);
      }

      const data = await response.json();
      const records = data.records || [];

      if (records.length === 0) {
        setError('No records found in data file');
        setIoRecords([]);
        setClients([]);
        setLastUpdated(data.exportedAt || new Date().toISOString());
        return;
      }

      setIoRecords(records);
      setLastUpdated(data.exportedAt || new Date().toISOString());

      // Extract unique clients from field_2384 (no duplicates)
      const uniqueClients = [...new Set(
        records
          .map(r => r.field_2384) // Client lookup field
          .filter(client => client && client.toString().trim() !== '') // Remove empty/null
      )].sort();

      setClients(
        uniqueClients.map(client => ({
          label: client,
          value: client
        }))
      );

      // Set default dates to start of month to today
      const today = new Date();
      const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      setStartDate(firstDayOfMonth);
      setEndDate(today);

      console.log(`✓ Loaded ${records.length} records from local data`);

    } catch (err) {
      console.error('Error loading data:', err);
      setError(`Error: ${err.message}. Make sure to run: npm run export-data`);
      setIoRecords([]);
      setClients([]);
    } finally {
      setLoading(false);
    }
  };

  // Refresh data by re-exporting from Knack (requires API credentials)
  const refreshDataFromKnack = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiKey = process.env.REACT_APP_KNACK_API_KEY;
      const appId = process.env.REACT_APP_KNACK_APP_ID;
      
      if (!apiKey || !appId) {
        throw new Error(
          'API credentials not found. Cannot refresh from Knack.'
        );
      }

      console.log('🔄 Refreshing data from Knack...');
      
      let allRecords = [];
      let pageNumber = 1;
      let hasMore = true;
      const batchSize = 250;

      while (hasMore && pageNumber <= 40) { // Max 10,000 records
        try {
          const response = await fetch(
            `https://api.knack.com/v1/objects/object_135/records?rows_per_page=${batchSize}&page=${pageNumber}`,
            {
              headers: {
                'X-Knack-REST-API-Key': apiKey,
                'X-Knack-Application-Id': appId,
                'Content-Type': 'application/json'
              }
            }
          );

          if (!response.ok) throw new Error(`API returned ${response.status}`);

          const data = await response.json();
          const records = data.records || [];
          
          if (records.length === 0) {
            hasMore = false;
          } else {
            allRecords = allRecords.concat(records);
            pageNumber++;
          }
        } catch (pageErr) {
          console.warn(`Error on page ${pageNumber}:`, pageErr);
          hasMore = false;
        }
      }

      if (allRecords.length === 0) {
        throw new Error('No records found from Knack');
      }

      setIoRecords(allRecords);
      setLastUpdated(new Date().toISOString());

      // Extract unique clients
      const uniqueClients = [...new Set(
        allRecords
          .map(r => r.field_2384)
          .filter(client => client && client.toString().trim() !== '')
      )].sort();

      setClients(
        uniqueClients.map(client => ({
          label: client,
          value: client
        }))
      );

      alert(`✅ Refreshed! Loaded ${allRecords.length} records from Knack`);
      console.log(`✓ Refreshed ${allRecords.length} records from Knack`);

    } catch (err) {
      console.error('Error refreshing:', err);
      setError(`Refresh failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Filter records based on date range and client
  const filteredRecords = ioRecords.filter(record => {
    // Filter by client (field_2384 - Client lookup)
    if (selectedClient && record.field_2384 !== selectedClient.value) {
      return false;
    }

    // Filter by date range (field_2313 - Start/End Date)
    if (startDate || endDate) {
      try {
        const recordDate = parseISO(record.field_2313); // Start Date / End Date
        
        if (startDate && isBefore(recordDate, startDate)) {
          return false;
        }
        
        if (endDate && isAfter(recordDate, endDate)) {
          return false;
        }
      } catch (err) {
        // If date parsing fails, include the record
        console.warn('Could not parse date for record:', record.id);
      }
    }

    return true;
  });

  // Extract creatives (images) from filtered records (object_135)
  // Memoize to prevent unnecessary recalculations
  const creatives = useMemo(() => {
    return filteredRecords.map(record => {
      // Try multiple potential creative/image fields in priority order
      const imageUrl = 
        record.field_2409 || // Creative upload
        record.field_2427 || // Creative Pickup
        record.field_3422 || // External Creative Link 1
        record.field_3425 || // External Creative Link 2
        record.field_3426 || // External Creative Link 3
        record.field_3427 || // External Creative Link 4
        null;

      // Only store essential fields to save memory
      return {
        id: record.id,
        clientName: record.field_2384,
        ioCampaignName: record.field_2309,
        productCampaignName: record.field_3340,
        displayCampaignName: record.field_3341,
        productText: record.field_2327,
        ioNumber: record.field_2469,
        startDate: record.field_2313,
        status: record.field_2300,
        imageUrl: imageUrl,
      };
    }).filter(creative => creative.clientName);
  }, [filteredRecords]);

  const handleResetFilters = () => {
    setSelectedClient(null);
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    setStartDate(firstDayOfMonth);
    setEndDate(today);
  };

  const openModal = (creative) => {
    setSelectedCreative(creative);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedCreative(null);
  };

  if (loading) {
    return <LoadingSpinner message="Loading campaigns data..." />;
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>🎬 Creative Lookup</h1>
        <p>Search and filter marketing campaign creatives</p>
      </header>

      {error && (
        <div className="error-banner">
          <p>⚠️ {error}</p>
          <small>Try running: <code>npm run export-data</code></small>
        </div>
      )}

      <main className="app-main">
        <div className="filters-section">
          <div className="filter-group">
            <label>Client</label>
            <Select
              aria-label="Filter by client"
              options={clients}
              value={selectedClient}
              onChange={setSelectedClient}
              placeholder="Select a client..."
              isClearable
              isSearchable
              styles={{
                control: (base) => ({
                  ...base,
                  minHeight: '40px'
                })
              }}
            />
          </div>

          <div className="filter-group">
            <label>Start Date</label>
            <DatePicker
              selected={startDate}
              onChange={(date) => setStartDate(date)}
              placeholderText="Start date"
              dateFormat="MM/dd/yyyy"
              className="date-picker"
            />
          </div>

          <div className="filter-group">
            <label>End Date</label>
            <DatePicker
              selected={endDate}
              onChange={(date) => setEndDate(date)}
              placeholderText="End date"
              dateFormat="MM/dd/yyyy"
              className="date-picker"
            />
          </div>

          <div className="filter-actions">
            <button className="reset-button" onClick={handleResetFilters}>
              Reset Filters
            </button>
            <button className="refresh-button" onClick={refreshDataFromKnack}>
              🔄 Refresh Data
            </button>
          </div>
        </div>

        <div className="results-info">
          <p>
            Showing <strong>{creatives.length}</strong> of{' '}
            <strong>{ioRecords.length}</strong> campaigns
            {lastUpdated && (
              <span style={{ marginLeft: '20px', fontSize: '0.9em', opacity: 0.7 }}>
                Last updated: {new Date(lastUpdated).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>

        {creatives.length === 0 ? (
          <div className="no-results">
            <p>No campaigns found matching your filters.</p>
            <button onClick={handleResetFilters}>Clear Filters</button>
          </div>
        ) : (
          <div className="creatives-grid">
            {creatives.map((creative) => (
              <div key={creative.id} className="creative-card">
                <div
                  className="creative-image"
                  onClick={() => openModal(creative)}
                >
                  {creative.imageUrl ? (
                    <img
                      src={creative.imageUrl}
                      alt={creative.ioCampaignName || 'Campaign creative'}
                      onError={(e) => {
                        e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23eee" width="200" height="200"/%3E%3Ctext x="50%25" y="50%25" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="14" fill="%23999"%3ENo image%3C/text%3E%3C/svg%3E';
                      }}
                    />
                  ) : (
                    <div className="no-image">No image available</div>
                  )}
                </div>

                <div className="creative-info">
                  <h3 title={creative.ioCampaignName}>
                    {creative.ioCampaignName || creative.productCampaignName || 'Untitled'}
                  </h3>
                  <p className="client-name">{creative.clientName}</p>
                  {creative.productText && (
                    <p className="product-text" title={creative.productText}>
                      {creative.productText}
                    </p>
                  )}
                  <p className="meta">
                    <strong>IO:</strong> {creative.ioNumber || 'N/A'}
                  </p>
                  <p className="meta">
                    <strong>Date:</strong> {creative.startDate || 'N/A'}
                  </p>
                  <p className="meta">
                    <strong>Status:</strong>
                    <span className={`status-badge ${creative.status?.toLowerCase()}`}>
                      {creative.status || 'N/A'}
                    </span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <ImageModal
        creative={selectedCreative}
        isOpen={isModalOpen}
        onClose={closeModal}
      />
    </div>
  );
};

export default App;
