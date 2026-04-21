const CLIENT_ID = import.meta.env.VITE_X_CLIENT_ID
const REDIRECT_URI = import.meta.env.VITE_X_REDIRECT_URI || 'http://localhost:5173/callback'
const SCOPES = 'bookmark.read tweet.read users.read offline.access'

export function getAuthURL() {
  const codeChallenge = generateCodeChallenge()
  sessionStorage.setItem('code_challenge', codeChallenge)
  const state = generateState()

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'plain',
  })

  return `https://x.com/i/oauth2/authorize?${params}`
}

export function generateState() {
  const state = Math.random().toString(36).substring(7)
  sessionStorage.setItem('oauth_state', state)
  return state
}

export function generateCodeChallenge() {
  return Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15)
}

export function validateState(state) {
  const savedState = sessionStorage.getItem('oauth_state')
  sessionStorage.removeItem('oauth_state')
  return state === savedState
}

export async function exchangeCodeForToken(code) {
  try {
    const codeChallenge = sessionStorage.getItem('code_challenge')
    sessionStorage.removeItem('code_challenge')

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: codeChallenge,
    })

    const response = await fetch('https://x.com/2/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('Token error:', data)
      throw new Error(`Token exchange failed: ${data.error_description || data.error}`)
    }

    localStorage.setItem('x_access_token', data.access_token)
    if (data.refresh_token) {
      localStorage.setItem('x_refresh_token', data.refresh_token)
    }

    return data.access_token
  } catch (error) {
    console.error('Auth error:', error)
    throw error
  }
}

export function getStoredToken() {
  return localStorage.getItem('x_access_token')
}

export function clearToken() {
  localStorage.removeItem('x_access_token')
  localStorage.removeItem('x_refresh_token')
}
