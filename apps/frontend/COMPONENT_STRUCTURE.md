# Component Structure

## File Tree

```
apps/frontend/
├── app/
│   ├── contexts/
│   │   └── AuthContext.tsx          # Auth state management
│   ├── hooks/
│   │   └── useAuth.ts               # Auth hook
│   ├── lib/
│   │   └── api/
│   │       ├── client.ts            # Axios client with interceptors
│   │       └── v1.d.ts              # Auto-generated types (existing)
│   ├── routes/
│   │   ├── auth.login.tsx           # New user pairing request
│   │   ├── auth.pairing-code.tsx    # Display code & poll
│   │   └── auth.verify-otp.tsx      # Returning user OTP login
│   ├── styles/
│   │   └── phone-input.css          # Phone input custom styles
│   ├── layout/
│   │   └── auth-layout.tsx          # Auth pages layout (updated)
│   ├── routes.ts                    # Routes config (updated)
│   └── root.tsx                     # App root with AuthProvider (updated)
├── .env.example                     # Environment variables template
├── AUTH_IMPLEMENTATION.md           # Technical documentation
├── SUMMARY.md                       # Implementation summary
└── COMPONENT_STRUCTURE.md          # This file
```

## Component Hierarchy

```
root.tsx (Layout)
├── QueryClientProvider
│   └── ConfigProvider (Ant Design)
│       └── AntdApp
│           └── App (default)
│               └── AuthProvider ← NEW
│                   └── Outlet
│                       └── auth-layout.tsx
│                           └── Outlet
│                               ├── auth.login.tsx
│                               ├── auth.pairing-code.tsx
│                               └── auth.verify-otp.tsx
```

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                     AuthContext                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ State:                                             │ │
│  │  - user: User | null                              │ │
│  │  - token: string | null                           │ │
│  │  - isAuthenticated: boolean                       │ │
│  │  - isLoading: boolean                             │ │
│  │                                                    │ │
│  │ Methods:                                           │ │
│  │  - login(token, user?)                            │ │
│  │  - logout()                                        │ │
│  │  - checkAuth()                                     │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↑
                          │ useAuth()
                          │
      ┌───────────────────┼───────────────────┐
      │                   │                   │
┌─────▼─────┐  ┌──────────▼──────┐  ┌────────▼─────────┐
│   Login   │  │ Pairing Code    │  │  Verify OTP      │
│   Page    │  │     Page        │  │     Page         │
└───────────┘  └─────────────────┘  └──────────────────┘
      │                   │                   │
      ▼                   ▼                   ▼
┌──────────────────────────────────────────────────────┐
│                  API Client (axios)                   │
│  ┌────────────────────────────────────────────────┐  │
│  │ Request Interceptor:                          │  │
│  │  - Add Authorization: Bearer {token}          │  │
│  │                                                │  │
│  │ Response Interceptor:                         │  │
│  │  - On 401: clear auth, redirect to login     │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
                          │
                          ▼
                  ┌───────────────┐
                  │   Backend API  │
                  │   (NestJS)     │
                  └───────────────┘
```

## State Management Flow

### Initial Load
```
1. App mounts
   └→ AuthProvider initializes
      └→ checkAuth() called
         ├→ Read token from localStorage
         ├→ If token exists:
         │  └→ GET /auth/me
         │     ├→ Success: set user state
         │     └→ Failure: clear auth
         └→ Set isLoading = false
```

### New User Flow
```
1. User visits /auth/login
   └→ Enter phone number
      └→ Submit form
         └→ POST /auth/request-pairing
            ├→ Success:
            │  └→ Navigate to /auth/pairing-code
            │     └→ Poll GET /auth/me every 3s
            │        └→ On 200:
            │           ├→ login(token, user)
            │           └→ Navigate to /onboarding/import
            └→ Error: show notification
```

### Returning User Flow
```
1. User visits /auth/verify-otp
   └→ Step 1: Enter phone number
      └→ POST /auth/login
         └→ Success: show OTP input
            └→ Step 2: Enter OTP
               └→ POST /auth/verify-otp
                  ├→ Success:
                  │  ├→ login(token, user)
                  │  └→ Navigate to /dashboard
                  └→ Error: show notification
```

### Logout Flow
```
1. User calls logout()
   └→ Clear token from localStorage
      └→ Clear user from localStorage
         └→ Reset context state
            └→ Redirect to /auth/login (via 401 interceptor)
```

## API Client Architecture

```
┌──────────────────────────────────────────┐
│         apiClient (axios instance)        │
├──────────────────────────────────────────┤
│ baseURL: VITE_API_URL                    │
│                                          │
│ Request Flow:                            │
│   1. Request created                     │
│   2. ↓ Request Interceptor               │
│      - Get token from localStorage       │
│      - Add Authorization header          │
│   3. ↓ Send to server                    │
│   4. ↓ Receive response                  │
│   5. ↓ Response Interceptor              │
│      - Check for 401                     │
│      - If 401 & not on /auth:           │
│        • Clear localStorage              │
│        • Redirect to /auth/login         │
│   6. ↓ Return to caller                  │
└──────────────────────────────────────────┘
```

## Local Storage Schema

```typescript
// localStorage keys
{
  "auth_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": "{\"id\":\"123\",\"phoneNumber\":\"+33612345678\",...}"
}
```

## Component Props & State

### auth.login.tsx
```typescript
State:
  - phoneNumber: string
  - isLoading: boolean

Methods:
  - handleSubmit(): Promise<void>

API Calls:
  - POST /auth/request-pairing
```

### auth.pairing-code.tsx
```typescript
State:
  - isPolling: boolean

Location State (from navigation):
  - phoneNumber: string
  - code: string

Methods:
  - pollAuthStatus(): Promise<void>

API Calls:
  - GET /auth/me (every 3s)
```

### auth.verify-otp.tsx
```typescript
State:
  - phoneNumber: string
  - isRequestingOtp: boolean
  - isVerifying: boolean
  - otpSent: boolean

Methods:
  - handleRequestOtp(): Promise<void>
  - handleVerifyOtp(values): Promise<void>

API Calls:
  - POST /auth/login
  - POST /auth/verify-otp
```

## Styling Architecture

```
┌─────────────────────────────────────┐
│         Tailwind CSS v4             │
│  - Utility classes                  │
│  - Custom theme (Inter font)        │
│  - Responsive breakpoints           │
└─────────────────────────────────────┘
              +
┌─────────────────────────────────────┐
│        Ant Design v5                │
│  - Button, Input, Card, Form        │
│  - Typography, Steps, Spin          │
│  - notification system              │
│  - Input.OTP component              │
└─────────────────────────────────────┘
              +
┌─────────────────────────────────────┐
│     react-phone-number-input        │
│  - PhoneInput component             │
│  - E.164 format validation          │
│  - Country selector                 │
│  + phone-input.css (custom styles)  │
└─────────────────────────────────────┘
```

## Error Handling Flow

```
API Error
    │
    ├→ 401 Unauthorized
    │   └→ Axios Response Interceptor
    │       ├→ Clear localStorage
    │       └→ Redirect to /auth/login
    │
    ├→ 400 Bad Request
    │   └→ Show notification.error
    │       └→ Display error.response.data.message
    │
    ├→ 404 Not Found
    │   └→ Show notification.error
    │       └→ Display "User not found"
    │
    └→ 500 Server Error
        └→ Show notification.error
            └→ Display generic error message
```
