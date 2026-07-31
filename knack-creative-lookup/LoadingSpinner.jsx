.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.modal-content {
  background: white;
  border-radius: 12px;
  max-width: 1000px;
  max-height: 90vh;
  overflow-y: auto;
  position: relative;
  animation: slideUp 0.3s ease;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.3);
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: white;
  border: none;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  font-size: 1.5rem;
  cursor: pointer;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  transition: all 0.2s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.modal-close:hover {
  background-color: #f3f4f6;
  color: #1f2937;
  transform: rotate(90deg);
}

.modal-body {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2rem;
  padding: 2rem;
}

@media (max-width: 768px) {
  .modal-body {
    grid-template-columns: 1fr;
    gap: 1.5rem;
    padding: 1.5rem 1rem;
  }

  .modal-close {
    top: 0.5rem;
    right: 0.5rem;
    width: 2rem;
    height: 2rem;
  }
}

/* Image Container */
.modal-image-container {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #f9fafb;
  border-radius: 8px;
  overflow: hidden;
  max-height: 500px;
}

.modal-image {
  max-width: 100%;
  max-height: 500px;
  width: auto;
  height: auto;
  object-fit: contain;
}

/* Details Section */
.modal-details {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.modal-details h2 {
  font-size: 1.5rem;
  color: #1f2937;
  margin-bottom: 1.5rem;
  word-break: break-word;
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  margin-bottom: 2rem;
}

@media (max-width: 600px) {
  .detail-grid {
    grid-template-columns: 1fr;
  }
}

.detail-item {
  display: flex;
  flex-direction: column;
}

.detail-item label {
  font-weight: 600;
  color: #6b7280;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 0.5rem;
}

.detail-item p {
  font-size: 1rem;
  color: #1f2937;
  word-break: break-word;
}

.detail-item .status-badge {
  display: inline-block;
  width: fit-content;
}

/* Modal Actions */
.modal-actions {
  display: flex;
  gap: 1rem;
  flex-direction: column;
}

@media (min-width: 768px) {
  .modal-actions {
    flex-direction: row;
  }
}

.download-button,
.close-button {
  flex: 1;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 8px;
  font-weight: 600;
  cursor: pointer;
  font-size: 1rem;
  transition: all 0.2s ease;
}

.download-button {
  background-color: #3b82f6;
  color: white;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.download-button:hover {
  background-color: #2563eb;
  box-shadow: 0 4px 6px rgba(59, 130, 246, 0.3);
}

.close-button {
  background-color: #e5e7eb;
  color: #374151;
}

.close-button:hover {
  background-color: #d1d5db;
}

.close-button:active,
.download-button:active {
  transform: scale(0.98);
}

/* Scrollbar Styling */
.modal-content::-webkit-scrollbar {
  width: 8px;
}

.modal-content::-webkit-scrollbar-track {
  background: #f1f5f9;
}

.modal-content::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 4px;
}

.modal-content::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
