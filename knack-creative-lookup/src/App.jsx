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
      const objectId = process.env.REACT_APP_KNACK_IO_OBJECT_ID; // e.g., "object_234"
      
      if (!apiKey || !objectId) {
        throw new Error('Missing REACT_APP_KNACK_API_KEY or REACT_APP_KNACK_IO_OBJECT_ID');
      }

      const response = await axios.get(
        `https://api.knack.com/v1/objects/${objectId}/records`,
        {
          headers: {
            'X-Knack-REST-API-Key': apiKey,
            'Content-Type': 'application/json'
          },
          params: {
            rows_per_page: 10000 // Fetch all records
          }
        }
      );

      const records = response.data.records || [];
      setIoRecords(records);

      // Extract unique clients
      const uniqueClients = [...new Set(
        records
          .map(r => r.field_2243) // Client Organization Name
          .filter(Boolean)
      )].sort();

      setClients(
        uniqueClients.map(client => ({
          label: client,
          value: client
        }))
      );
    } catch (err) {
      console.error('Error fetching records:', err);
      setError(err.message || 'Failed to fetch data from Knack');
    } finally {
      setLoading(false);
    }
  };

  // Filter records based on date range and client
  const filteredRecords = ioRecords.filter(record => {
    // Filter by client
    if (selectedClient && record.field_2243 !== selectedClient.value) {
      return false;
    }

    // Filter by date range
    if (startDate || endDate) {
      const recordDate = parseISO(record.field_2234); // Date Created
      
      if (startDate && isBefore(recordDate, startDate)) {
        return false;
      }
      
      if (endDate && isAfter(recordDate, endDate)) {
        return false;
      }
    }

    return true;
  });

  // Extract creatives (images) from filtered records
  const creatives = filteredRecords.map(record => {
    // Try multiple potential image fields
    const imageUrl = 
      record.field_2264 || // Uploaded Files
      record.field_149 ||  // Upload Your Logo
      record.field_2977 || // Dashboard URL Text
      null;

    return {
      id: record.id,
      clientName: record.field_2243,
      campaignName: record.field_2233,
      dateCreated: record.field_2234,
      ioNumber: record.field_2426,
      imageUrl: imageUrl,
      status: record.field_2254,
      record: record
    };
  }).filter(creative => creative.imageUrl); // Only show records with images

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
        <h3 title={creative.campaignName}>{creative.campaignName || 'Untitled'}</h3>
        <p className="client-name">{creative.clientName}</p>
        <p className="meta">
          <strong>IO:</strong> {creative.ioNumber}
        </p>
        <p className="meta">
          <strong>Date:</strong> {creative.dateCreated}
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
