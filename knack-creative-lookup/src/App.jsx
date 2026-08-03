import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DatePicker from 'react-datepicker';
import Select from 'react-select';
import { parseISO, isAfter, isBefore, parseISO as parse } from 'date-fns';
import ImageModal from './components/ImageModal';
import LoadingSpinner from './components/LoadingSpinner';
import './App.css';

const App = () => {
  // State
  const [ioRecords, setIoRecords] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  // Filters
  const [selectedClient, setSelectedClient] = useState(null);
  const [startDate, setStartDate] = useState(null);
  const [endDate, setEndDate] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  
  // Modal
  const [selectedImage, setSelectedImage] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Initialize - Fetch IO records from Knack
  useEffect(() => {
    fetchIoRecords();
  }, []);

  const fetchIoRecords = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiKey = process.env.REACT_APP_KNACK_API_KEY;
      const appId = process.env.REACT_APP_KNACK_APP_ID;
      
      if (!apiKey || !appId) {
        throw new Error(
          'Missing required Knack credentials. Check: REACT_APP_KNACK_API_KEY, REACT_APP_KNACK_APP_ID'
        );
      }

      // Query object_135 (Campaign/Product records)
      const objectId = 'object_135';

      const response = await axios.get(
        `https://api.knack.com/v1/objects/${objectId}/records`,
        {
          headers: {
            'X-Knack-REST-API-Key': apiKey,
            'X-Knack-Application-Id': appId,
            'Content-Type': 'application/json'
          },
          params: {
            rows_per_page: 10000 // Fetch all records
          }
        }
      );

      const records = response.data.records || [];
      setIoRecords(records);

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

    } catch (err) {
      console.error('Error fetching records:', err);
      setError(err.message || 'Failed to fetch data from Knack');
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
  const creatives = filteredRecords.map(record => {
    // Try multiple potential creative/image fields in priority order
    const imageUrl = 
      record.field_2409 || // Creative upload
      record.field_2427 || // Creative Pickup
      record.field_3422 || // External Creative Link 1
      record.field_3425 || // External Creative Link 2
      record.field_3426 || // External Creative Link 3
      record.field_3427 || // External Creative Link 4
      null;

    return {
      id: record.id,
      clientName: record.field_2384,     // Client lookup
      ioCampaignName: record.field_2309,  // IO Campaign Name
      productCampaignName: record.field_3340,  // Product Campaign Name
      displayCampaignName: record.field_3341,  // Display Campaign Name
      creativeUpload: record.field_2409,
      creativePickup: record.field_2427,
      externalLink1: record.field_3422,
      externalLink2: record.field_3425,
      externalLink3: record.field_3426,
      externalLink4: record.field_3427,
      prodCreativePickup: record.field_2748,   // Prod# - Creative Pickup
      productText: record.field_2327,
      ioNumber: record.field_2469,  // IO #
      startDate: record.field_2313,  // Start Date
      status: record.field_2300,     // Status
      imageUrl: imageUrl,
      record: record
    };
  }).filter(creative => creative.clientName); // Only show records with client info

  const handleImageClick = (creative) => {
    setSelectedImage(creative);
    setIsModalOpen(true);
  };

  const handleClientChange = (option) => {
    setSelectedClient(option);
  };

  const handleReset = () => {
    setSelectedClient(null);
    setStartDate(null);
    setEndDate(null);
    setSearchInput('');
  };

  const clientOptions = clients.filter(client =>
    client.label.toLowerCase().includes(searchInput.toLowerCase())
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <h1>📸 Creative Lookup</h1>
        <p>Find creatives running in your campaigns</p>
      </header>

      <div className="filters-section">
        <div className="filter-group">
          <label>Client Organization</label>
          <Select
            options={clientOptions}
            value={selectedClient}
            onChange={handleClientChange}
            placeholder="Search and select client..."
            isClearable
            isSearchable
            onInputChange={setSearchInput}
            inputValue={searchInput}
            styles={customSelectStyles}
          />
        </div>

        <div className="filter-group">
          <label>Start Date</label>
          <DatePicker
            selected={startDate}
            onChange={date => setStartDate(date)}
            placeholderText="Select start date"
            dateFormat="MM/dd/yyyy"
            className="date-input"
            isClearable
          />
        </div>

        <div className="filter-group">
          <label>End Date</label>
          <DatePicker
            selected={endDate}
            onChange={date => setEndDate(date)}
            placeholderText="Select end date"
            dateFormat="MM/dd/yyyy"
            className="date-input"
            isClearable
            minDate={startDate}
          />
        </div>

        <button className="reset-button" onClick={handleReset}>
          Reset Filters
        </button>
      </div>

      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}

      {loading && <LoadingSpinner />}

      {!loading && creatives.length === 0 && (
        <div className="empty-state">
          <p>No creatives found. Try adjusting your filters.</p>
        </div>
      )}

      {!loading && creatives.length > 0 && (
        <div className="results-section">
          <h2>Results ({creatives.length} creatives)</h2>
          
          <div className="creatives-grid">
            {creatives.map(creative => (
              <CreativeCard
                key={creative.id}
                creative={creative}
                onImageClick={handleImageClick}
              />
            ))}
          </div>
        </div>
      )}

      {isModalOpen && selectedImage && (
        <ImageModal
          creative={selectedImage}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedImage(null);
          }}
        />
      )}
    </div>
  );
};

// Creative Card Component
const CreativeCard = ({ creative, onImageClick }) => {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="creative-card">
      <div 
        className="creative-thumbnail"
        onClick={() => onImageClick(creative)}
        role="button"
        tabIndex={0}
        onKeyPress={(e) => e.key === 'Enter' && onImageClick(creative)}
      >
        {imageError ? (
          <div className="image-error">No image available</div>
        ) : (
          <img
            src={creative.imageUrl}
            alt={creative.campaignName}
            onError={() => setImageError(true)}
          />
        )}
        <div className="thumbnail-overlay">
          <span className="expand-icon">🔍</span>
        </div>
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
            {creative.status}
          </span>
        </p>
      </div>
    </div>
  );
};

// Custom React-Select Styles
const customSelectStyles = {
  control: (base) => ({
    ...base,
    borderRadius: '8px',
    borderColor: '#d1d5db',
    boxShadow: 'none',
    '&:hover': {
      borderColor: '#9ca3af'
    }
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected ? '#3b82f6' : state.isFocused ? '#eff6ff' : 'white',
    color: state.isSelected ? 'white' : 'black',
    cursor: 'pointer'
  })
};

export default App;
