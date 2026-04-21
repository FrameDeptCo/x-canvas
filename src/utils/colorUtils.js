// Extract dominant color from an image element
export function extractDominantColor(imgEl) {
  try {
    if (!imgEl || imgEl.tagName !== 'IMG' && imgEl.tagName !== 'VIDEO') return null

    const canvas = document.createElement('canvas')
    canvas.width = 80
    canvas.height = 80
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    if (imgEl.tagName === 'VIDEO') {
      if (imgEl.readyState < 2) return null // video not loaded
      ctx.drawImage(imgEl, 0, 0, 80, 80)
    } else {
      ctx.drawImage(imgEl, 0, 0, 80, 80)
    }

    const imageData = ctx.getImageData(0, 0, 80, 80)
    const data = imageData.data

    // RGB bucketing
    const buckets = {}
    for (let i = 0; i < data.length; i += 4) {
      const r = Math.round(data[i] / 64) * 64
      const g = Math.round(data[i + 1] / 64) * 64
      const b = Math.round(data[i + 2] / 64) * 64
      const a = data[i + 3]
      if (a > 128) {
        const key = `${r},${g},${b}`
        buckets[key] = (buckets[key] || 0) + 1
      }
    }

    const topBucket = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]
    if (!topBucket) return null
    const [rgb] = topBucket
    const [r, g, b] = rgb.split(',').map(Number)
    return rgbToHex(r, g, b)
  } catch (e) {
    console.error('[ColorUtils] Error extracting color:', e)
    return null
  }
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => {
    const hex = x.toString(16)
    return hex.length === 1 ? '0' + hex : hex
  }).join('').toUpperCase()
}

// Check if two colors are similar (within threshold)
export function isColorSimilar(color1, color2, threshold = 40) {
  if (!color1 || !color2) return false
  const [r1, g1, b1] = hexToRgb(color1)
  const [r2, g2, b2] = hexToRgb(color2)
  const distance = Math.sqrt(
    Math.pow(r1 - r2, 2) + Math.pow(g1 - g2, 2) + Math.pow(b1 - b2, 2)
  )
  return distance < threshold
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
    : [0, 0, 0]
}
