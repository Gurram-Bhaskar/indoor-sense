# Hybrid Bimodal Navigator — Indoor Sense

A software-only accessible indoor navigation system for visually impaired users in GPS-denied environments. Combines a multimodal AI assistant (Gemini 2.5 Flash) with physical ArUco marker localization and a human-in-the-loop WebRTC fallback.

## Architecture

```
┌──────────────────┐    Gemini Live WS     ┌────────────────────────┐
│                  │◄─────────────────────►│  Gemini 2.5 Flash      │
│  Phone PWA       │   video + audio       │  Native Audio (Live)   │
│  (React.js)      │                       └────────────────────────┘
│                  │
│  Camera ─────────┼──── WebSocket ───────►┌────────────────────────┐
│  Feed            │   640x480 JPEG        │  Python Backend        │
│                  │◄── nav + obstacles ───│  FastAPI + OpenCV      │
│                  │                       │  ArUco + YOLO + A*     │
│  Call Assistant ─┼──── WebRTC ──────────►┌────────────────────────┐
│                  │   peer-to-peer        │  Streamlit Dashboard   │
└──────────────────┘                       └────────────────────────┘
```

## Features

### 1. Multimodal AI Vision Assistant
- Streams live camera + microphone to **Gemini 2.5 Flash Native Audio** via WebSocket
- System-prompted as a hospital navigation assistant — prioritizes obstacles, signage, floor changes, moving people
- **Barge-in support** — user can interrupt the AI mid-speech (`START_OF_ACTIVITY_INTERRUPTS`)
- Audio responses played back in real-time via Web Audio API

### 2. ArUco Marker Localization + A* Routing
- Physical **ArUco markers** (DICT_4X4_100) placed at key locations act as spatial anchors
- **OpenCV** detects markers from the camera feed on the Python backend
- Detected marker ID maps to a **topological graph** (JSON) with 4 nodes:
  - `ID 0` → Entrance
  - `ID 1` → Reception
  - `ID 2` → Hallway-A
  - `ID 3` → Room-101
- **A\* pathfinding** (Manhattan distance heuristic) computes shortest route to destination
- Navigation instructions spoken **instantly via local TTS** (~50ms) — no cloud round-trip
- Gemini receives location context silently for spatial-aware follow-up responses

### 3. YOLO Obstacle Detection
- **YOLOv8 Nano** runs locally on the backend
- Detects 8 indoor hazard classes: person, chair, couch, bed, dining table, TV, laptop, door
- Obstacle warnings spoken **instantly via local TTS**
- Throttled to once per 2 seconds to avoid alert fatigue

### 4. Emergency Human Assistance (WebRTC)
- **"Call Assistant"** button pauses the AI and opens a live WebRTC video call
- Human operator sees the user's camera feed and can speak directly
- Powered by **streamlit-webrtc** on a secondary dashboard
- AI resumes automatically when the call ends

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React.js PWA (Vite, JSX) |
| AI Vision & Voice | Gemini 2.5 Flash Native Audio (WebSocket Live API) |
| Marker Detection | OpenCV `cv2.aruco` (DICT_4X4_100) |
| Obstacle Detection | YOLOv8 Nano (ultralytics) |
| Pathfinding | A* with Manhattan distance heuristic |
| Local Speech | Web Speech API (SpeechSynthesis) |
| Human Fallback | WebRTC via streamlit-webrtc |
| Backend | FastAPI + WebSocket |

## Latency Optimizations

| Component | Technique | Latency |
|-----------|-----------|---------|
| Audio capture | 1024-sample buffer, `latencyHint: 'interactive'` | ~64ms |
| Audio playback | Immediate scheduling, zero padding | ~10ms |
| Video to Gemini | 256×192 @ JPEG 0.25, 4 fps | ~3-5KB/frame |
| Video to ArUco | 640×480 @ JPEG 0.8, 1 fps | crisp edges |
| Navigation speech | Local TTS (no network) | ~50ms |
| Obstacle warnings | Local TTS (no network) | ~50ms |

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey)

### 1. Frontend
```bash
cd frontend
npm install
npm run dev
```
Opens on `https://localhost:3000` (HTTPS required for camera access on mobile).

### 2. Backend
```bash
cd backend
pip install -r requirements.txt
python app.py
```
Runs on `http://localhost:8000`. The frontend proxies WebSocket connections to this.

### 3. Telepresence Dashboard (optional)
```bash
cd backend/telepresence
streamlit run streamlit_app.py --server.port 8501
```

### 4. Mobile Access
Connect your phone to the same WiFi and open:
```
https://<your-laptop-ip>:3000
```
Accept the self-signed certificate warning → enter your API key → tap Start Navigation.

## Demo Setup

1. **Print ArUco markers** from the `aruco_markers/` folder (4 markers, A4 paper)
2. **Tape them** along your demo route:
   - Marker 0 → Starting point (Entrance)
   - Marker 1 → Second stop (Reception)
   - Marker 2 → Hallway intersection
   - Marker 3 → Destination (Room-101)
3. **Start all services** (frontend + backend)
4. **Walk the route** with your phone — the AI describes surroundings, markers trigger turn-by-turn directions

### Demo Script
1. Open app → enter API key → tap **Start Navigation**
2. Point camera around — AI speaks obstacle/scene descriptions
3. Walk toward **Marker 0** — hear *"You are at the Entrance. Proceed right toward Reception."*
4. Continue to **Marker 3** — hear *"You have arrived at your destination."*
5. Tap **Call Assistant** — live video call to human operator
6. End call — AI resumes

## Project Structure

```
indoor-sense/
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── public/
│   │   ├── manifest.json
│   │   └── favicon.svg
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── App.css
│       ├── lib/
│       │   ├── gemini-live-client.js      # Gemini Live API WebSocket client
│       │   ├── audio-streamer.js          # PCM audio playback (24kHz)
│       │   └── worklets/
│       │       └── audio-processor.js     # AudioWorklet mic capture
│       ├── contexts/
│       │   └── LiveAPIContext.jsx          # Core hook: streaming + nav injection
│       └── components/
│           ├── VideoFeed.jsx              # Camera display
│           └── ControlPanel.jsx           # Controls + status + transcript
├── backend/
│   ├── app.py                             # FastAPI WebSocket server
│   ├── requirements.txt
│   ├── vision/
│   │   ├── aruco_detector.py              # ArUco marker detection (DICT_4X4_100)
│   │   ├── yolo_obstacle.py               # YOLOv8 obstacle detection
│   │   └── test_webcam.py                 # Standalone webcam test
│   ├── navigation/
│   │   └── graph.py                       # Topological graph + A* pathfinding
│   └── telepresence/
│       └── streamlit_app.py               # WebRTC human assistant dashboard
└── aruco_markers/                         # Printable ArUco markers (ID 0-3)
```

## Team

Built at MEGA Hackathon 2026.
