# Quick Start Guide - Authentication Pages

## Setup (One Time)

1. **Install dependencies** (if not already done):
   ```bash
   cd /Users/bruce/Documents/project/whatsapp-agent
   pnpm install
   ```

2. **Configure environment**:
   ```bash
   cd apps/frontend
   cp .env.example .env
   ```

   Edit `.env` if your backend runs on a different port:
   ```env
   VITE_API_URL=http://localhost:3005
   ```

## Running the App

```bash
# From the monorepo root
cd /Users/bruce/Documents/project/whatsapp-agent

# Start frontend dev server
cd apps/frontend
pnpm dev

# The app will be available at http://localhost:5173
```

## Test the Authentication Flows

### Option 1: New User (Pairing Flow)

1. Navigate to: `http://localhost:5173/auth/login`

2. Enter a phone number in E.164 format (e.g., `+33612345678`)

3. Click "Demander le code de pairing"

4. You'll be redirected to the pairing code page showing an 8-digit code

5. Follow the instructions to pair with WhatsApp

6. The page will automatically poll and redirect when pairing succeeds

### Option 2: Returning User (OTP Flow)

1. Navigate to: `http://localhost:5173/auth/verify-otp`

2. **Step 1**: Enter your phone number

3. Click "Recevoir le code OTP"

4. **Step 2**: Enter the 6-digit OTP code received on WhatsApp

5. Click "Se connecter"

6. You'll be redirected to the dashboard on success

## Pages Overview

| URL | Purpose |
|-----|---------|
| `/auth/login` | Request pairing code (new users) |
| `/auth/pairing-code` | Display code & wait for pairing |
| `/auth/verify-otp` | OTP verification (returning users) |

## Common Issues & Solutions

### "Cannot connect to backend"
- Make sure the backend is running on port 3005
- Check `VITE_API_URL` in `.env`
- Verify CORS is enabled on the backend

### Phone number validation error
- Phone numbers must be in E.164 format: `+[country_code][number]`
- Example: `+33612345678` (France)
- Example: `+14155552671` (USA)

### "Token expired" or 401 errors
- Click "Déconnexion" or manually clear localStorage
- Go back to `/auth/login` or `/auth/verify-otp`

### Pairing code polling not working
- Check browser console for errors
- Ensure backend `/auth/me` endpoint is accessible
- Verify the pairing code was generated successfully

## Development Tools

### Clear Authentication State
Open browser console and run:
```javascript
localStorage.removeItem('auth_token')
localStorage.removeItem('user')
location.reload()
```

### Check Current Auth State
```javascript
console.log('Token:', localStorage.getItem('auth_token'))
console.log('User:', JSON.parse(localStorage.getItem('user') || 'null'))
```

### View API Calls
1. Open browser DevTools
2. Go to Network tab
3. Filter by "Fetch/XHR"
4. Submit a form and watch the requests

## File Structure

```
apps/frontend/
├── app/
│   ├── contexts/AuthContext.tsx        ← Global auth state
│   ├── hooks/useAuth.ts                ← Hook to use auth
│   ├── lib/api/client.ts               ← Axios client
│   ├── routes/
│   │   ├── auth.login.tsx              ← Login page
│   │   ├── auth.pairing-code.tsx       ← Pairing page
│   │   └── auth.verify-otp.tsx         ← OTP page
│   └── styles/phone-input.css          ← Phone input styles
└── .env                                ← Your config (create this)
```

## Next Steps

After authentication is working:

1. Create the `/onboarding/import` page (redirect destination for pairing)
2. Create the `/dashboard` page (redirect destination for OTP login)
3. Add protected route wrapper to check authentication
4. Implement logout functionality in the UI

## API Endpoints Used

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/auth/request-pairing` | Get pairing code |
| GET | `/auth/me` | Check auth status |
| POST | `/auth/login` | Request OTP |
| POST | `/auth/verify-otp` | Verify OTP |

## Support

For more details, see:
- `AUTH_IMPLEMENTATION.md` - Full technical documentation
- `SUMMARY.md` - Implementation summary
- `COMPONENT_STRUCTURE.md` - Architecture diagrams
