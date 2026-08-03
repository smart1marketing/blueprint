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
            <h2>{creative.ioCampaignName || creative.productCampaignName || 'Campaign Details'}</h2>

            <div className="detail-grid">
              <div className="detail-item">
                <label>Client</label>
                <p>{creative.clientName}</p>
              </div>

              <div className="detail-item">
                <label>IO Campaign Name</label>
                <p>{creative.ioCampaignName || 'N/A'}</p>
              </div>

              <div className="detail-item">
                <label>Product Campaign Name</label>
                <p>{creative.productCampaignName || 'N/A'}</p>
              </div>

              <div className="detail-item">
                <label>Display Campaign Name</label>
                <p>{creative.displayCampaignName || 'N/A'}</p>
              </div>

              <div className="detail-item">
                <label>IO Number</label>
                <p>{creative.ioNumber || 'N/A'}</p>
              </div>

              <div className="detail-item">
                <label>Start Date</label>
                <p>{creative.startDate || 'N/A'}</p>
              </div>

              <div className="detail-item">
                <label>Status</label>
                <p>
                  <span className={`status-badge ${creative.status?.toLowerCase()}`}>
                    {creative.status || 'N/A'}
                  </span>
                </p>
              </div>

              {creative.productText && (
                <div className="detail-item full-width">
                  <label>Product Text</label>
                  <p>{creative.productText}</p>
                </div>
              )}

              {creative.externalLink1 && (
                <div className="detail-item full-width">
                  <label>External Creative Links</label>
                  <ul className="link-list">
                    {creative.externalLink1 && <li><a href={creative.externalLink1} target="_blank" rel="noopener noreferrer">Link 1</a></li>}
                    {creative.externalLink2 && <li><a href={creative.externalLink2} target="_blank" rel="noopener noreferrer">Link 2</a></li>}
                    {creative.externalLink3 && <li><a href={creative.externalLink3} target="_blank" rel="noopener noreferrer">Link 3</a></li>}
                    {creative.externalLink4 && <li><a href={creative.externalLink4} target="_blank" rel="noopener noreferrer">Link 4</a></li>}
                  </ul>
                </div>
              )}
            </div>

            <div className="modal-actions">
              <a
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
