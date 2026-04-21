import express from 'express'
import cors from 'cors'
import fetch from 'node-fetch'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const app = express()
const PORT = 3001
const API_BASE = 'https://api.twitter.com/2'

app.use(cors())
app.use(express.json())

// Proxy endpoint for bookmarks - accepts user token from client
app.get('/api/bookmarks', async (req, res) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' })
    }

    const userToken = authHeader.substring(7) // Remove 'Bearer ' prefix

    const params = new URLSearchParams({
      max_results: 100,
      'tweet.fields': 'created_at,author_id,public_metrics,attachments',
      'user.fields': 'username,name,profile_image_url',
      'media.fields': 'preview_image_url,url',
      'expansions': 'author_id,attachments.media_keys',
    })

    if (req.query.pagination_token) {
      params.append('pagination_token', req.query.pagination_token)
    }

    const url = `${API_BASE}/users/me/bookmarks?${params}`
    console.log('Fetching bookmarks with user token...')

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${userToken}` },
    })

    console.log('Response status:', response.status)
    const data = await response.json()

    if (!response.ok) {
      console.log('API error response:', data)
      return res.status(response.status).json(data)
    }

    res.json(data)
  } catch (error) {
    console.error('Proxy error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.listen(PORT, () => {
  console.log(`Proxy server running on http://localhost:${PORT}`)
})
