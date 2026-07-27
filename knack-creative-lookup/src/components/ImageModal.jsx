import React from 'react';
import './ImageModal.css';

const ImageModal = ({ creative, isOpen, onClose }) => {
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  React.useEffect(() => {
    if (!isOpen) return;
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}>
          ✕
        </button>

        <div className="modal-body">
          <div className="modal-image-container">
            <img
              src={creative.imageUrl}
              alt={creative.campaignName}
              className="modal-image"
            />
          </div>

          <div className="modal-details">
            <h2>{creative.campaignName}</h2>
            
            <div className="detail-grid">
              <div className="detail-item">
                <label>Client</label>
                <p>{creative.clientName}</p>
              </div>

              <div className="detail-item">
                <label>IO Number</label>
                <p>{creative.ioNumber}</p>
              </div>

              <div className="detail-item">
                <label>Date Created</label>
                <p>{creative.dateCreated}</p>
              </div>

              <div className="detail-item">
                <label>Status</label>
                <p>
                  <span className={`status-badge ${creative.status?.toLowerCase()}`}>
                    {creative.status}
                  </span>
                </p>
              </div>
            </div>

            <div className="modal-actions">
              
                href={creative.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="download-button"
              >
                Open in New Tab
              </a>
              <button className="close-button" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImageModal;
