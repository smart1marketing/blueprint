* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: #f9fafb;
}

.app-container {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

/* Header */
.app-header {
  background: white;
  padding: 2rem;
  text-align: center;
  border-bottom: 2px solid #e5e7eb;
  box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
}

.app-header h1 {
  font-size: 2rem;
  color: #1f2937;
  margin-bottom: 0.5rem;
}

.app-header p {
  color: #6b7280;
  font-size: 1rem;
}

/* Filters Section */
.filters-section {
  background: white;
  margin: 2rem;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
}

.filter-group {
  margin-bottom: 1.5rem;
}

.filter-group:last-of-type {
  margin-bottom: 0;
}

.filter-group label {
  display: block;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.5rem;
  font-size: 0.95rem;
}

.date-input {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 1rem;
  transition: all 0.2s ease;
  font-family: inherit;
}

.date-input:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

/* Responsive Filters */
@media (min-width: 768px) {
  .filters-section {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr auto;
    gap: 1.5rem;
    align-items: flex-end;
  }

  .filter-group {
    margin-bottom: 0;
  }
}

/* Buttons */
.reset-button {
  background-color: #ef4444;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 0.95rem;
}

.reset-button:hover {
  background-color: #dc2626;
  box-shadow: 0 4px 6px rgba(239, 68, 68, 0.3);
}

.reset-button:active {
  transform: scale(0.98);
}

/* Error Message */
.error-message {
  background-color: #fee2e2;
  color: #991b1b;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  margin: 2rem;
  border-left: 4px solid #dc2626;
}

/* Empty State */
.empty-state {
  background: white;
  margin: 2rem;
  padding: 3rem 2rem;
  border-radius: 12px;
  text-align: center;
  color: #6b7280;
  font-size: 1.1rem;
}

/* Results Section */
.results-section {
  margin: 2rem;
  padding: 2rem;
  background: white;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.07);
}

.results-section h2 {
  color: #1f2937;
  margin-bottom: 2rem;
  font-size: 1.5rem;
}

/* Creatives Grid */
.creatives-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1.5rem;
}

@media (max-width: 640px) {
  .creatives-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 1rem;
  }
}

/* Creative Card */
.creative-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.3s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.creative-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 10px 15px rgba(0, 0, 0, 0.1);
  border-color: #3b82f6;
}

/* Creative Thumbnail */
.creative-thumbnail {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  background-color: #f3f4f6;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.creative-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.creative-card:hover .creative-thumbnail img {
  transform: scale(1.05);
}

.thumbnail-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.creative-card:hover .thumbnail-overlay {
  opacity: 1;
}

.expand-icon {
  font-size: 2rem;
  color: white;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.image-error {
  color: #6b7280;
  text-align: center;
  font-size: 0.9rem;
}

/* Creative Info */
.creative-info {
  padding: 1rem;
}

.creative-info h3 {
  font-size: 0.95rem;
  color: #1f2937;
  margin-bottom: 0.5rem;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.client-name {
  font-size: 0.85rem;
  color: #3b82f6;
  font-weight: 600;
  margin-bottom: 0.75rem;
}

.meta {
  font-size: 0.75rem;
  color: #6b7280;
  margin-bottom: 0.4rem;
  line-height: 1.4;
}

.meta strong {
  color: #374151;
}

/* Status Badge */
.status-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  margin-left: 0.5rem;
}

.status-badge.complete {
  background-color: #dcfce7;
  color: #166534;
}

.status-badge.live {
  background-color: #dbeafe;
  color: #0c4a6e;
}

.status-badge.pending {
  background-color: #fed7aa;
  color: #92400e;
}

.status-badge.cancelled {
  background-color: #fee2e2;
  color: #991b1b;
}

/* Responsive */
@media (max-width: 768px) {
  .filters-section {
    grid-template-columns: 1fr;
  }

  .app-header {
    padding: 1.5rem 1rem;
  }

  .app-header h1 {
    font-size: 1.5rem;
  }

  .results-section {
    margin: 1rem;
    padding: 1rem;
  }

  .filters-section {
    margin: 1rem;
  }
}
