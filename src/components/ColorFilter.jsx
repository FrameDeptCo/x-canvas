import React, { useState } from 'react'
import './ColorFilter.css'

const PRESET_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8',
  '#F7DC6F', '#BB8FCE', '#85C1E2', '#F8B195', '#C5E1A5',
  '#FF6B9D', '#00D2FC', '#7209B7', '#3A0CA3', '#FB5607',
]

export default function ColorFilter({ onFilterChange, onClose, activeColor }) {
  const [color, setColor] = useState(activeColor || '#000000')

  const handleColorChange = (e) => {
    setColor(e.target.value)
  }

  const handlePresetClick = (presetColor) => {
    setColor(presetColor)
    onFilterChange(presetColor)
  }

  const handleHexChange = (e) => {
    const val = e.target.value
    if (/^#[0-9A-F]{6}$/i.test(val)) {
      setColor(val)
      onFilterChange(val)
    }
  }

  const handleApply = () => {
    onFilterChange(color)
    onClose()
  }

  return (
    <div className="color-filter">
      <div className="color-filter-header">
        <h3>Filter by Color</h3>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      {/* Color gradient picker */}
      <div className="color-picker-section">
        <label>Select Color:</label>
        <input
          type="color"
          value={color}
          onChange={handleColorChange}
          className="color-input"
        />
      </div>

      {/* Preset colors */}
      <div className="preset-section">
        <label>Quick Colors:</label>
        <div className="preset-grid">
          {PRESET_COLORS.map(c => (
            <button
              key={c}
              className={`preset-swatch${activeColor === c ? ' active' : ''}`}
              style={{ backgroundColor: c }}
              onClick={() => handlePresetClick(c)}
              title={c}
            />
          ))}
        </div>
      </div>

      {/* Hex input */}
      <div className="hex-section">
        <label>Hex:</label>
        <input
          type="text"
          value={color}
          onChange={handleHexChange}
          placeholder="#000000"
          className="hex-input"
        />
      </div>

      {/* Action buttons */}
      <div className="filter-actions">
        <button className="btn-apply" onClick={handleApply}>Apply Filter</button>
        <button className="btn-cancel" onClick={onClose}>Cancel</button>
      </div>
    </div>
  )
}
