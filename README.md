# Touch Synth

Gesture-controlled web synth that turns your hands into a hybrid instrument. A Python hand-tracking server streams landmarks from a webcam to a React/Tone.js client over WebSockets, triggering drums, bass, pads and leads with finger curls and pinches.

## Features
- Real-time hand tracking powered by MediaPipe with a lightweight Python WebSocket bridge.
- React + Tone.js front end for expressive synths, drums, pads and FX.
- Depth-aware pad sustain, finger-pinch accents and a live landmark overlay.
- Typewriter onboarding plus live JSON feed so you can see what the tracker is sending.
- Vite-based dev workflow with hot reloads.

## Built With
- MediaPipe: real-time hand tracking
- OpenCV: camera capture
- WebSockets: low-latency gesture streaming
- React (Vite): frontend UI
- Tone.js: audio synthesis
- NumPy: numerical processing

## Prerequisites
- Python 3.10+ and a webcam.
- Node.js 18+ (for Vite + React 19).
- `models/hand_landmarker.task` download available at https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker

## Quick start
1) Set up the hand-tracking server (from repo root):
```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python hand_server.py
```
The server opens a camera feed, runs MediaPipe and broadcasts landmarks on `ws://localhost:8765`.

2) Run the web app (in another terminal):
```bash
cd webapp
npm install
npm run dev
```
Open the printed URL (usually http://localhost:5173).

3) Use it
- Allow camera access in the browser.
- Tap or press any key once to unlock audio (browser autoplay policy).
- Keep your hands in frame; a mini preview with a green skeleton will appear bottom-right.

## Gesture map
Left hand (rhythm):
- Thumb curl = kick; Index curl = snare noise; Middle curl = square bass hit.
- Ring curl = metallic tom; Pinky curl = high tom.
- Pinch thumb to index/middle/ring/pinky for extra percussive hits and bass drops.

Right hand (melody/pads):
- Index curl = plucked FM hit (D4); Middle curl = lead (F4).
- Ring curl starts a sustained triangle pad chord; pull your hand back to sustain, make a fist or move forward to release. Chord changes with horizontal hand position.
- Pinky curl = sparkle FX.
- Pinch thumb+index = Veridis-style square stab; thumb+middle = shimmering poly chord; thumb+ring = gritty bass.

## How it works
- `hand_server.py` uses OpenCV to grab frames, MediaPipe to extract landmarks and `websockets` to broadcast `{ hands: [...] }` payloads to any client.
- `webapp/src/useGestureSocket.jsx` connects to `ws://localhost:8765` and feeds landmarks into `App.jsx`, which smooths points, detects curls/pinches and maps them to Tone.js instruments.
- A canvas overlay mirrors the camera preview to show the tracked skeleton in real time.

Example payload:
```json
{
  "hands": [
    {
      "label": "left",
      "thumb": 0.14,
      "index": 0.09,
      "middle": 0.08,
      "ring": 0.07,
      "pinky": 0.06,
      "gesture": "open",
      "landmarks": [{ "x": 0.42, "y": 0.55, "z": -0.02 }, "..."]
    }
  ]
}
```

## Project structure
- `hand_server.py`: MediaPipe + OpenCV hand tracker and WebSocket broadcaster.
- `models/hand_landmarker.task`: MediaPipe model weights.
- `requirements.txt`: Python deps (mediapipe, opencv-python, numpy, websockets).
- `webapp/`: React/Tone.js client (Vite). Key files: `src/App.jsx`, `src/useGestureSocket.jsx`, `src/Typewriter.jsx`.

## Development scripts
From `webapp/`:
- `npm run dev`: start Vite dev server.
- `npm run build`: production build.
- `npm run preview`: preview the production bundle.
- `npm run lint`: lint source files.

## Troubleshooting
- **Camera won’t start:** ensure no other app is using the webcam and the browser has permission.
- **No sound:** click or press any key to unlock audio; confirm your output device in the OS mixer.
- **WebSocket errors:** the client expects `ws://localhost:8765`; restart the Python server and refresh.
- **Laggy tracking:** good lighting and a clear background improve landmark stability; close other camera apps.

## Credits
- graphicoreBitmapFont4-Thin from graphicoreBMFB
  https://github.com/graphicore/graphicoreBMFB

## License
MIT
