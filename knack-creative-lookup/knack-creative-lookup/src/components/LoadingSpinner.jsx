import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ message = "Loading creatives..." }) => (
  <div className="loading-container">
    <div className="spinner"></div>
    <p>{message}</p>
    <small style={{ marginTop: '10px', opacity: 0.7 }}>
      This may take 10-15 seconds on first load...
    </small>
  </div>
);

export default LoadingSpinner;
