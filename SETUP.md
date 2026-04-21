# Setup Guide for x-canvas

## Prerequisites

- **Node.js 16+** and **npm** installed
- **X.com Developer Account** with API credentials

## Step 1: Install Dependencies

### On Windows (Recommended)
Double-click `setup.bat` in the project root, or run from Command Prompt:
```cmd
setup.bat
```

### On macOS/Linux
```bash
npm install --legacy-peer-deps
```

## Step 2: Get X.com API Credentials

1. Go to https://developer.twitter.com/en/portal/dashboard
2. Create a new app (if you don't have one)
3. Go to your app settings → "Keys and Tokens"
4. Generate or copy your:
   - **Client ID**
   - **Client Secret**
5. Under "Authentication Settings":
   - Add redirect URI: `http://localhost:5173/callback`

## Step 3: Configure Environment Variables

1. Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

2. Edit `.env.local` and add your credentials:
```
VITE_X_CLIENT_ID=your_actual_client_id_here
VITE_X_CLIENT_SECRET=your_actual_client_secret_here
VITE_X_REDIRECT_URI=http://localhost:5173/callback
```

## Step 4: Run the App

```bash
npm run dev
```

Open http://localhost:5173 in your browser.

## Step 5: Sync Your Bookmarks

1. Click "Login & Sync" to authenticate with X.com
2. After login, click "Sync Bookmarks" to fetch all bookmarks
3. Bookmarks will appear on the infinite canvas

## Troubleshooting

### "npm command not found"
- Make sure Node.js is installed: `node --version`
- Add Node.js to your PATH if needed

### "Module not found" errors
- Delete `node_modules` folder and `package-lock.json`
- Run `npm install --legacy-peer-deps` again

### OAuth redirect fails
- Make sure `VITE_X_REDIRECT_URI` matches your app's redirect URI exactly
- Check that the port matches (5173 for dev server)

### No bookmarks appear
- Check browser console for errors (F12 → Console)
- Verify your X.com API credentials are correct
- Make sure your app has permission to read bookmarks

## Building for Production

```bash
npm run build
npm run preview
```

Output will be in the `dist/` folder.

## API Rate Limits

X.com API has rate limits. If you sync a large number of bookmarks:
- The app implements automatic pagination
- Respects rate limit headers
- Stores bookmarks locally to avoid re-fetching

## Privacy Note

- All bookmarks are stored **locally in IndexedDB**
- No data is sent to external servers except X.com API calls
- Your access token is stored in `localStorage` (for session persistence)

## Next Steps

- Customize folder colors and organization
- Add bookmark filtering/search
- Create custom canvas layouts
- Share canvas states

For more details, see [README.md](README.md)
