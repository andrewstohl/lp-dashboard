# DeFi LP Dashboard - Frontend

Modern Next.js 14 frontend for the DeFi LP Intelligence Dashboard.

## Tech Stack

- **Next.js 14** - App Router
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Axios** - API client

## Features

- 🎨 Beautiful, responsive UI
- ⚡ Real-time position tracking
- 📊 Interactive dashboards
- 🔄 Loading states
- ⚠️ Error handling
- 📱 Mobile-friendly design

## Getting Started

### Development Mode

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Visit: http://localhost:3000

### Production Build

```bash
# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
frontend/
├── app/
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Home page
│   └── globals.css         # Global styles
├── components/
│   ├── WalletInput.tsx     # Wallet address input
│   ├── PositionCard.tsx    # Position card component
│   ├── PositionSummary.tsx # Portfolio summary
│   ├── LoadingSpinner.tsx  # Loading state
│   └── ErrorMessage.tsx    # Error display
├── lib/
│   ├── api.ts              # API client
│   └── types.ts            # TypeScript types
├── public/                 # Static assets
├── package.json
├── tsconfig.json
└── tailwind.config.ts
```

## Environment Variables

Create `.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Components

### WalletInput
Input form for entering Ethereum wallet addresses.

### PositionCard
Displays individual LP position with tokens, values, and fees.

### PositionSummary
Shows portfolio-level metrics (total positions, value, fees).

### LoadingSpinner
Animated loading indicator.

### ErrorMessage
User-friendly error messages with retry information.

## API Integration

The frontend communicates with the FastAPI backend through the API client in `lib/api.ts`.

**Endpoints Used:**
- `GET /api/v1/wallet/{address}` - Fetch wallet positions
- `GET /health` - Health check

## Styling

Using Tailwind CSS with custom configuration:

- **Primary Color**: Blue (`primary-500`, `primary-600`, etc.)
- **Responsive Breakpoints**: `sm`, `md`, `lg`
- **Gradient Backgrounds**: Various components

## Development Tips

1. **Hot Reload**: Changes auto-refresh in dev mode
2. **TypeScript**: All components are fully typed
3. **Error Boundaries**: Graceful error handling
4. **Mobile First**: Responsive design from the ground up

## Build & Deploy

```bash
# Production build
npm run build

# The build output will be in .next/
```

Deploy to Vercel, Netlify, or any platform supporting Next.js 14.

## Future Enhancements

- [ ] Dark mode toggle
- [ ] Position filtering/sorting
- [ ] Historical data charts
- [ ] Export to CSV/PDF
- [ ] Wallet connection (WalletConnect)
- [ ] AI insights integration

---

**Part of the DeFi LP Intelligence Dashboard**
