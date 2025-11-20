# Onboarding Flow Documentation

## Overview

The onboarding flow consists of 4 steps that guide new users through setting up their WhatsApp
Business integration.

## File Structure

```
apps/frontend/
├── app/
│   ├── components/
│   │   └── onboarding/
│   │       ├── OnboardingLayout.tsx       # Shared layout with progress stepper
│   │       ├── ProductCard.tsx            # Product display with AI analysis
│   │       ├── AIAnalysisPanel.tsx        # AI suggestions panel
│   │       └── index.ts                   # Exports
│   ├── hooks/
│   │   └── useOnboarding.ts               # Onboarding state management hook
│   └── routes/
│       ├── onboarding.import.tsx          # Step 1: Import WhatsApp data
│       ├── onboarding.review-products.tsx # Step 2: Review products
│       ├── onboarding.business-info.tsx   # Step 3: Business information
│       └── onboarding.advanced-options.tsx # Step 4: Advanced options
```

## Routes

All routes are registered in `app/routes.ts`:

- `/onboarding/import` - Step 1
- `/onboarding/review-products` - Step 2
- `/onboarding/business-info` - Step 3
- `/onboarding/advanced-options` - Step 4

## Step 1: Import WhatsApp Data

**Route:** `/onboarding/import`

**Features:**

- Auto-starts import on mount
- Loading animation with progress tracking
- 4 import steps displayed with status indicators
- Error handling with retry button
- Calls `POST /users/me/import-whatsapp`
- Auto-navigates to next step on success

**Components Used:**

- Progress (Ant Design)
- Spin (Ant Design)
- Alert (Ant Design)

## Step 2: Review Products

**Route:** `/onboarding/review-products`

**Features:**

- Displays imported products in cards
- Each product has:
  - Image, name, description, price
  - "Analyser avec l'IA" button
  - Checkbox to approve
- AI Analysis:
  - Calls whatsapp-agent backend for analysis
  - Shows suggestions (spelling, metadata, improvements)
  - Accept/reject individual suggestions
- "Tout analyser" button to analyze all products
- Continue button (disabled until all products approved)

**Components Used:**

- ProductCard (custom)
- AIAnalysisPanel (custom)
- Card, Button, Checkbox, Tag (Ant Design)

**API Endpoints:**

- `GET /products` - Load products
- `POST /ai/analyze-product/:id` - Analyze product

## Step 3: Business Info

**Route:** `/onboarding/business-info`

**Features:**

- Business location form:
  - Country (select)
  - City (input)
  - Address (textarea)
- Delivery locations section:
  - Add/remove multiple locations
  - Each location: Country, City, Zone Name, Price
- Payment methods:
  - Cash (checkbox)
  - Mobile Money (checkbox with conditional fields)
    - Number, Name, Require proof
- Form validation
- Saves to backend and navigates to next step

**Components Used:**

- Form, Input, Select, InputNumber (Ant Design)
- Card, Button, Checkbox (Ant Design)

**API Endpoints:**

- `POST /settings/business` - Save business settings

## Step 4: Advanced Options

**Route:** `/onboarding/advanced-options`

**Features:**

- Auto-reminder option:
  - Send reminder after 24h if customer promises order
- Review request option:
  - Ask for review when order delivered
- Tags system explanation card
- Info alert about modifying options later
- Completes onboarding and navigates to dashboard

**Components Used:**

- Form, Checkbox, Card, Alert, Tag (Ant Design)
- Icons: BellOutlined, StarOutlined, TagsOutlined

**API Endpoints:**

- `POST /settings/advanced` - Save advanced settings

## Shared Components

### OnboardingLayout

Wrapper component providing:

- Progress stepper (4 steps)
- Consistent layout
- Title display
- Gradient background

### ProductCard

Displays a single product with:

- Product image (with fallback)
- Name, description, price
- AI analysis button
- Approval checkbox
- Expandable AI suggestions panel

### AIAnalysisPanel

Shows AI analysis results:

- Suggestion type badges (spelling, metadata, improvement)
- Current vs suggested values
- Reason for suggestion
- Apply/Dismiss buttons

## Hooks

### useOnboarding

Manages onboarding state:

```typescript
const {
  currentStep, // Current step info
  currentStepNumber, // Step index (0-3)
  totalSteps, // Total steps (4)
  canProceed, // Can proceed to next step
  setCanProceed, // Update proceed status
  getNextStep, // Get next step info
  getPreviousStep, // Get previous step info
  hasNext, // Has next step
  hasPrevious, // Has previous step
  isFirstStep, // Is first step
  isLastStep, // Is last step
} = useOnboarding(currentPath)
```

## Styling

- Uses Tailwind CSS v4 for styling
- Ant Design v5 components
- Mobile-responsive design
- Gradient backgrounds
- Hover effects and transitions

## Error Handling

- All API calls wrapped in try-catch
- Error messages displayed with Ant Design message/alert
- Retry functionality where applicable
- Loading states for all async operations

## Type Safety

All components are TypeScript with:

- Interface definitions for data structures
- Proper typing for props
- Type-safe API client usage

## Navigation Flow

```
Import → Review Products → Business Info → Advanced Options → Dashboard
   ↓            ↓                ↓                ↓
 Auto      User Approves    User Fills      User Configures
         All Products         Form            Options
```

## Backend Integration

The flow expects these backend endpoints:

1. `POST /users/me/import-whatsapp` - Import WhatsApp data
2. `GET /products` - Get imported products
3. `POST /ai/analyze-product/:id` - Analyze product with AI
4. `POST /settings/business` - Save business settings
5. `POST /settings/advanced` - Save advanced settings

## Future Enhancements

- Add progress persistence (save current step)
- Add skip functionality for optional steps
- Add analytics tracking
- Add onboarding tour/tooltips
- Add video tutorials
