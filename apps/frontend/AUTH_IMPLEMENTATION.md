# Authentication Implementation

This document describes the authentication system implemented for the WhatsApp Manager Agent
frontend.

## Overview

The authentication system supports two flows:

1. **New users**: Pairing flow with WhatsApp
2. **Returning users**: OTP verification flow

## Architecture

### Files Created

#### API & Client

- `/app/lib/api/client.ts` - Axios client with authentication interceptors
- `/app/lib/api/v1.d.ts` - Auto-generated TypeScript types from Swagger (existing)

#### Context & Hooks

- `/app/contexts/AuthContext.tsx` - React context for authentication state
- `/app/hooks/useAuth.ts` - Hook to access auth context

#### Pages (Routes)

- `/app/routes/auth.login.tsx` - Login page (request pairing code)
- `/app/routes/auth.pairing-code.tsx` - Display pairing code and wait for WhatsApp connection
- `/app/routes/auth.verify-otp.tsx` - OTP verification for returning users

#### Styles

- `/app/styles/phone-input.css` - Custom styles for phone number input

## Authentication Flows

### Flow 1: New User (Pairing)

1. **Login Page** (`/auth/login`)
   - User enters phone number (E.164 format)
   - Click "Demander le code de pairing"
   - POST `/auth/request-pairing` with `{ phoneNumber }`
   - Receive 8-digit pairing code
   - Navigate to `/auth/pairing-code` with state

2. **Pairing Code Page** (`/auth/pairing-code`)
   - Display 8-digit code (formatted with spaces)
   - Show step-by-step instructions in French
   - Poll GET `/auth/me` every 3 seconds
   - On 401: continue polling (not authenticated yet)
   - On 200: save JWT token, navigate to `/onboarding/import`
   - On other errors: show notification and stop polling

### Flow 2: Returning User (OTP)

1. **Verify OTP Page** (`/auth/verify-otp`)
   - **Step 1**: Enter phone number
     - Click "Recevoir le code OTP"
     - POST `/auth/login` with `{ phoneNumber }`
     - OTP sent via WhatsApp

   - **Step 2**: Enter OTP code
     - 6-digit OTP input field
     - Click "Se connecter"
     - POST `/auth/verify-otp` with `{ phoneNumber, code }`
     - On success: save JWT, navigate to `/dashboard`
     - On error: show error notification

## API Endpoints

### POST `/auth/request-pairing`

Request a pairing code for new users.

**Request:**

```json
{
  "phoneNumber": "+33612345678"
}
```

**Response:**

```json
{
  "code": "12345678",
  "message": "Pairing code sent successfully"
}
```

### GET `/auth/me`

Get current authenticated user (requires Bearer token).

**Response (200):**

```json
{
  "id": "user-id",
  "phoneNumber": "+33612345678",
  "status": "active",
  "whatsappProfile": { ... }
}
```

**Response (401):** User not authenticated yet.

### POST `/auth/login`

Send OTP to user's WhatsApp for login.

**Request:**

```json
{
  "phoneNumber": "+33612345678"
}
```

**Response:**

```json
{
  "message": "OTP envoyé avec succès"
}
```

### POST `/auth/verify-otp`

Verify OTP and complete login.

**Request:**

```json
{
  "phoneNumber": "+33612345678",
  "code": "123456"
}
```

**Response:**

```json
{
  "accessToken": "jwt-token-here",
  "user": {
    "id": "user-id",
    "phoneNumber": "+33612345678",
    "status": "active",
    "whatsappProfile": { ... }
  }
}
```

## State Management

### AuthContext State

```typescript
interface AuthContextType {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (token: string, user?: User) => void
  logout: () => void
  checkAuth: () => Promise<void>
}
```

### Local Storage

- `auth_token`: JWT token
- `user`: Serialized user object

## Security Features

1. **Token Management**
   - Automatic token attachment to requests (via axios interceptor)
   - Token stored in localStorage
   - Auto-redirect to login on 401 responses

2. **Phone Number Validation**
   - E.164 format validation
   - International phone input with country selection
   - Client-side validation before API calls

3. **Error Handling**
   - User-friendly error messages in French
   - Notification system for all errors
   - Automatic cleanup on auth failures

## Styling

- **Tailwind CSS v4**: Utility-first styling
- **Ant Design v5**: UI components (Button, Input, Card, Form, etc.)
- **Gradient backgrounds**: Green-to-blue gradient for auth pages
- **Responsive design**: Mobile-first approach

## Dependencies Added

- `axios`: HTTP client
- `react-phone-number-input`: International phone number input

## Environment Variables

Create a `.env` file in the frontend directory:

```env
VITE_API_URL=http://localhost:3005
```

## Navigation Flow

```
/auth/login (new users)
  ↓ (request pairing)
/auth/pairing-code
  ↓ (polling success)
/onboarding/import

/auth/verify-otp (returning users)
  ↓ (step 1: request OTP)
  ↓ (step 2: verify OTP)
/dashboard
```

## Future Improvements

1. Add refresh token support
2. Implement "Remember me" functionality
3. Add biometric authentication for mobile
4. Add rate limiting UI feedback
5. Implement session timeout warnings
6. Add multi-language support (currently French only)
