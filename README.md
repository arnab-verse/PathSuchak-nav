# 🧭 PathSuchak (पथसूचक)
[![Build Status](https://img.shields.io/badge/Build-Success-emerald?style=flat-square&logo=github&logoColor=white)](https://github.com/arnab-verse/PathSuchak-nav)
[![Deployment](https://img.shields.io/badge/Cloudflare_Pages-Active-orange?style=flat-square&logo=cloudflare&logoColor=white)](https://pathsuchak-navg.pages.dev)
[![Engine](https://img.shields.io/badge/Vite-React%2019-ff7a1a?style=flat-square&logo=vite&logoColor=white)](https://vitejs.dev)
[![Database](https://img.shields.io/badge/Database-IndexedDB%20%2B%20Firestore-yellow?style=flat-square&logo=firebase&logoColor=white)](https://firebase.google.com)
[![Styling](https://img.shields.io/badge/Styling-Tailwind%20CSS%20v4-38bdf8?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
> **"Turn Uncertainty Into Awareness, Because Every Path Has a Story."**
>
> A resilient, highly-secure, offline-first tactical road navigation, disaster response, and early-warning safety platform specifically engineered for Indian highways, coastal regions, and remote zero-connectivity zones.
---
## 📌 Table of Contents
1. [📖 Overview](#-overview)
2. [⚡ Complete Key Features](#-complete-key-features)
3. [🏗️ Architectural Design & Offline Ledger](#️-architectural-design--offline-ledger)
4. [📂 Codebase Directory Layout](#-codebase-directory-layout)
5. [🔧 Local Setup & Configuration](#-local-setup--configuration)
6. [🔥 Firebase Architecture & Blueprints](#-firebase-architecture--blueprints)
7. [☁️ Cloudflare Pages Production Deployment](#️-cloudflare-pages-production-deployment)
8. [🛡️ Security Posture & Rules](#️-security-posture--rules)
9. [🤝 Contributing & Community Guideline](#-contributing--community-guideline)
10. [📄 License](#-license)
---
## 📖 Overview
In emergencies, active disaster zones, and remote rural Indian roads, mobile networks (4G/5G) are the first infrastructure elements to collapse. **PathSuchak** solves this existential hazard by serving as a localized, high-performance web and PWA-compatible navigational safety console that requires **zero cloud connection** for active routing operations. 
By utilizing local browser engines, pre-compiled road geometry, custom TopoJSON files, and client-side IndexedDB databases, users can plot highways, track cyclones, issue emergency distress beacons, and log localized safety hazards entirely in an offline sandboxed environment. The system intelligently queue-syncs all offline ledger entries using conflict-free timestamp resolutions as soon as connection is re-established.
---
## ⚡ Complete Key Features
### 🗺️ 1. Resilient Offline-First Road Navigation
*   **Offline Vector Tile Packages:** Download and cache pre-compiled road maps directly inside your browser cache. Manage storage space in real time using the built-in offline package controller.
*   **Client-Side Routing Calculus:** Calculates high-precision shortest and safest turn-by-turn routing tracks using native OSRM geometry logic without communicating with remote servers.
*   **Dynamic Offline Re-routing:** Constantly monitors GPS drifts and snaps you back to the closest road node, generating immediate alternative tracks in true offline environments.
*   **Offline Speech Synthesizer:** Direct turn-by-turn spoken audio guidance powered by native SpeechSynthesis synthesis, requiring zero internet connectivity.
### 🌀 2. IMD Doppler Radar & Cyclone Tracking
*   **Doppler Weather Layer:** Real-time canvas overlay representing live cloud densities, weather anomalies, and high-intensity rainfall warnings.
*   **Active Cyclone Tracker:** Trace active cyclones throughout the Bay of Bengal and Arabian Sea. Visualizes exact track path predictions, pressure drops, and anticipated landfall hours.
*   **Severe Warning Push Banner:** Alerts the operator instantly if their active route intersects with an approaching storm's calculated landfall path.
### ⚠️ 3. Citizen Hazard & Road Incident Reporter
*   **Localized Incident Pins:** Pin road blockages, extreme waterlogging, fallen trees, storm debris, landslides, and high-risk floodways directly onto maps.
*   **High-Fidelity Severity Matrix:** Grade incidents from Low to Critical to keep other drivers on the highway fully informed of active dangers.
*   **IndexedDB Transaction Queue:** Every reported incident is logged instantly with precise timestamp records inside local memory and dynamically pushed to Firestore the moment network is restored.
### 🚨 4. Guarded SOS Distress Transponder
*   **Instant Location Broadcast:** Sends highly-accurate GPS coordinates, battery metrics, and user status variables directly to the community hazard grid.
*   **Local Siren Sounder:** Triggers high-frequency audio alerts from the speaker of the user's mobile device or tablet to notify local search parties.
*   **Direct Dispatch Hub:** Direct click-to-call links connecting users instantly to police, ambulance, NDRF, highway patrols, and national disaster centers without loading extra apps.
### 📞 5. Indian Emergency Services Directory
*   **Pre-Cached Agency Database:** Complete offline access to district-level disaster management directories, including NDMA, NDRF base locations, coastal state emergency desks, and medical centers.
*   **One-Tap Calling:** Connect immediately with the appropriate response authority directly through pre-configured, click-to-dial elements.
### 🗣️ 6. 15+ Native Indian Languages Localization
*   **Pre-hydrated Translation Keys:** Access the entire application interface in Hindi, Bengali, Telugu, Marathi, Tamil, Gujarati, Urdu, Kannada, Odia, Malayalam, Punjabi, Assamese, Maithili, Santali, Sanskrit, and English.
*   **Instant Translation Swaps:** Dynamically reload all UI components, navigational headings, weather alerts, and safety guidelines without downloading translation assets.
### 🧭 7. Dead Reckoning Telemetry & GPS Fusion
*   **Hardware Magnetometer Sync:** Combines physical compass headings and GPS orientation offsets to prevent compass drift on moving vehicles.
*   **Accuracy Quality Indicators:** Real-time telemetry monitoring (HDOP/VDOP metrics) ensuring users know the exact state and reliability of their GPS locks.

## 🏗️ Architectural Design & Offline Ledger

PathSuchak follows a **three-tier offline-resilient architecture** to isolate browser runtime failures from cloud-sync states:

┌─────────────────────────────────────────────────────────────┐
│ CLIENT-SIDE VIEW LAYER │
│ [React Components] ◄───► [Tactical Map Canvas] │
└──────────────┬──────────────────────────────▲───────────────┘
│ (Read/Write) │ (Sync States)
┌──────────────▼──────────────────────────────┴───────────────┐
│ PERSISTENT LOCAL DATA HUB │
│ [IndexedDB Sync Queue] ◄───► [Cache Storage API] │
│ (Transactions & Logs) (Vector Map Tiles) │
└──────────────┬──────────────────────────────────────────────┘
│ (Dynamic Online Check)
▼
┌─────────────────────────────────────────────────────────────┐
│ CLOUD INTEGRATION LAYER │
│ [Firebase Firestore / Auth] │
└─────────────────────────────────────────────────────────────┘

1.  **State Management:** Built on highly-performant React Context Provider engines managing independent data scopes (`AppContext`, `AuthContext`, `LanguageContext`).
2.  **Ticker Engine:** Custom, CPU-friendly frame tickers running on browser native `requestAnimationFrame` to manage progress renders, minimizing main-thread blocking during critical data imports.

---

## 📂 Codebase Directory Layout
PathSuchak-nav/
├── .aistudio/ # AI Studio workspace orchestration configurations
├── assets/ # Vector layouts, design schematics, and branding assets
├── public/ # Static directory (Favicons, static JSON overlays, Offline assets)
│ ├── data/ # India TopoJSON, emergency listings, pre-cached routes
│ └── favicon.svg # Custom tactical navigational beacon icon
├── src/ # Monolithic TypeScript Source Files
│ ├── components/ # Modularized UI Components
│ │ ├── ActiveDrivingHUD.tsx # Real-time driving metrics & navigation HUD
│ │ ├── AuthModal.tsx # Offline-aware authentication dialog
│ │ ├── BottomNav.tsx # Device-responsive primary application nav
│ │ ├── CycloneWarningSection.tsx # Doppler weather data representation
│ │ ├── EmergencySOS.tsx # Guarded Distress Beacon SOS panel
│ │ ├── ErrorBoundary.tsx # Crash containment and user-rescue view
│ │ ├── IncidentReporting.tsx # Citizen hazard log form & local manager
│ │ ├── IntroScreen.tsx # Dependency-free, pure CSS cinematic splash screen
│ │ └── ResilientNavigation.tsx # Primary offline routing control dashboard
│ ├── context/ # Context Providers (State Orchestration Core)
│ │ ├── AppContext.tsx # Central ledger, GPS, and sync operations
│ │ ├── AuthContext.tsx # Session handling & device recognition
│ │ └── LanguageContext.tsx # Multi-lingual dictionary mappings
│ ├── services/ # Integrations & GIS Calculators
│ │ ├── firebase.ts # Firestore secure listeners and transaction sweeps
│ │ ├── gps-geojson.service.ts # Bearing, snap-to-route, and coordinate calculations
│ │ ├── real-location.service.ts # Native Geolocation API wrappers with error fallbacks
│ │ ├── road-routing.service.ts # OSRM highway pathing calculus
│ │ ├── storage.ts # Low-level IndexedDB database driver API
│ │ └── voice-guidance.service.ts # Offline SpeechSynthesis audio turn navigator
│ ├── types/ # System-wide strongly-typed schemas
│ ├── App.tsx # Root component orchestrator
│ ├── index.css # Tailwind v4 configuration directives
│ └── main.tsx # DOM mounting and bundle hydration entrypoint
├── firebase-applet-config.json # Firebase security tokens
├── firebase-blueprint.json # Firestore cloud schema definitions
├── firestore.rules # Granular Firestore security access rules
├── index.html # Entry points and early pre-hydration templates
├── package.json # Direct and peer build dependencies
├── tailwind.config.js # Global stylesheet adjustments
├── tsconfig.json # TypeScript compiler rules
└── vite.config.ts # Vite asset, plugin, and production bundler configuration 

---

## 🔧 Local Setup & Configuration

### 💻 System Requirements
*   **Operating System:** Windows 10+, macOS Mojave+, Linux (Ubuntu/Debian preferred)
*   **Runtime:** Node.js v18.0.0 or higher
*   **Package Manager:** NPM v9.0.0+ (Included with Node.js)

### 🚀 Direct Installation Instructions

#### **Step 1: Clone the Repository**
```bash
git clone https://github.com/arnab-verse/PathSuchak-nav.git
cd PathSuchak-nav

npm ci

Environmental Configurations

VITE_FIREBASE_API_KEY=AIzaSyB4UKoFkPgfSeZN9K0cAmLcs7So4rWXxI0
VITE_FIREBASE_AUTH_DOMAIN=dotted-elysium-6v9wh.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=dotted-elysium-6v9wh
VITE_FIREBASE_STORAGE_BUCKET=dotted-elysium-6v9wh.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=1016759213728
VITE_FIREBASE_APP_ID=1:1016759213728:web:ea929ba2a447f64ecdb3c5

