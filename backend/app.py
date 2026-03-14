"""
FastAPI backend server for Indoor Sense Navigator.
- WebSocket /ws/vision: Receives video frames from frontend, runs:
  1. ArUco marker detection → A* navigation
  2. Scene matching → room position + exit guidance
  3. YOLO obstacle detection → hazard warnings
- CORS enabled for local network hackathon demo.
"""

import base64
import json
import os
import time

import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from vision.aruco_detector import detect_marker
from navigation.graph import get_navigation_instruction

# Try to load scene matcher (optional — needs captured room images)
try:
    from vision.scene_matcher import SceneMatcher
    scene_matcher = SceneMatcher()
    SCENE_MATCH_AVAILABLE = scene_matcher.loaded
    print(f"[Backend] Scene matcher: {'loaded' if SCENE_MATCH_AVAILABLE else 'no room data'}")
except Exception as e:
    scene_matcher = None
    SCENE_MATCH_AVAILABLE = False
    print(f"[Backend] Scene matcher not available: {e}")

# Try to load YOLO (optional — won't crash if ultralytics missing)
try:
    from vision.yolo_obstacle import detect_obstacles
    YOLO_AVAILABLE = True
    print("[Backend] YOLO obstacle detection loaded")
except Exception:
    YOLO_AVAILABLE = False
    print("[Backend] YOLO not available — obstacle detection disabled")

app = FastAPI(title="Indoor Sense Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Track state to avoid spamming duplicate updates
last_marker_id = None
last_marker_time = 0     # timestamp when last marker was seen — used to reset after leaving frame
last_obstacles = set()
last_obstacle_time = 0
last_scene_id = None
last_scene_time = 0


@app.websocket("/ws/vision")
async def vision_ws(websocket: WebSocket):
    global last_marker_id, last_marker_time, last_obstacles, last_obstacle_time
    global last_scene_id, last_scene_time
    await websocket.accept()
    print("[Backend] Vision WebSocket connected")

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)

            if "frame" not in data:
                continue

            # Decode base64 JPEG to OpenCV image
            frame_bytes = base64.b64decode(data["frame"])
            np_arr = np.frombuffer(frame_bytes, dtype=np.uint8)
            image = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

            if image is None:
                continue

            response = {}
            now = time.time()

            # 1. ArUco marker detection (highest priority)
            marker_id = detect_marker(image)

            # Auto-reset last_marker_id after 3s of no detection
            # so the same marker can be re-scanned when user returns to it
            if marker_id is None:
                if last_marker_id is not None and (now - last_marker_time) > 3.0:
                    print(f"[Backend] Marker {last_marker_id} left frame — reset")
                    last_marker_id = None
            else:
                last_marker_time = now  # keep alive while marker is visible

            if marker_id is not None and marker_id != last_marker_id:
                last_marker_id = marker_id
                last_scene_id = None  # Reset scene when marker found
                nav = get_navigation_instruction(marker_id)
                if nav:
                    response["marker_id"] = marker_id
                    response["navigation"] = nav
                    print(f"[Backend] Marker {marker_id} -> {nav['current_location']}")

            # 2. Scene matching — only if no ArUco marker detected (throttled to once per 3s)
            if (marker_id is None and SCENE_MATCH_AVAILABLE
                    and (now - last_scene_time) > 3):
                last_scene_time = now
                match = scene_matcher.match(image)
                if match and match["position_id"] != last_scene_id:
                    last_scene_id = match["position_id"]
                    response["room_position"] = match
                    print(f"[Backend] Scene match: {match['label']} (confidence: {match['confidence']})")

            # 3. YOLO obstacle detection (throttled to once per 2 seconds)
            if YOLO_AVAILABLE and (now - last_obstacle_time) > 2:
                last_obstacle_time = now
                obstacles = set(detect_obstacles(image))
                if obstacles and obstacles != last_obstacles:
                    last_obstacles = obstacles
                    response["obstacles"] = list(obstacles)
                    print(f"[Backend] Obstacles: {obstacles}")

            # Send response if there's anything to report
            if response:
                await websocket.send_text(json.dumps(response))

    except WebSocketDisconnect:
        print("[Backend] Vision WebSocket disconnected")
    except Exception as e:
        print(f"[Backend] Error: {e}")


@app.post("/reload-room")
async def reload_room():
    """Reload room reference images after capturing new ones."""
    global SCENE_MATCH_AVAILABLE
    if scene_matcher:
        scene_matcher.reload()
        SCENE_MATCH_AVAILABLE = scene_matcher.loaded
        return {"status": "reloaded", "positions": len(scene_matcher.positions)}
    return {"status": "no scene matcher"}


ROOM_DATA_DIR = os.path.join(os.path.dirname(__file__), "room_data")
IMAGES_DIR = os.path.join(ROOM_DATA_DIR, "images")
CONFIG_PATH = os.path.join(ROOM_DATA_DIR, "room_config.json")


@app.post("/capture")
async def capture_image(request: Request):
    """
    Receive a captured room image from the phone.
    Body: { "position_id": "near_door", "label": "...", "description": "...",
            "exit_instruction": "...", "exit_direction": "...", "frame": "<base64 jpeg>" }
    """
    global SCENE_MATCH_AVAILABLE
    data = await request.json()

    position_id = data.get("position_id")
    frame_b64 = data.get("frame")
    if not position_id or not frame_b64:
        return JSONResponse({"error": "position_id and frame required"}, status_code=400)

    os.makedirs(IMAGES_DIR, exist_ok=True)

    # Save image
    frame_bytes = base64.b64decode(frame_b64)
    img_path = os.path.join(IMAGES_DIR, f"{position_id}.jpg")
    with open(img_path, "wb") as f:
        f.write(frame_bytes)

    # Update config
    config = {"room_name": "Demo Room", "positions": []}
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            config = json.load(f)

    # Remove existing entry for this position if any
    config["positions"] = [p for p in config["positions"] if p["id"] != position_id]

    # Add new entry
    config["positions"].append({
        "id": position_id,
        "label": data.get("label", position_id),
        "description": data.get("description", ""),
        "exit_instruction": data.get("exit_instruction", ""),
        "exit_direction": data.get("exit_direction", ""),
        "image": f"images/{position_id}.jpg",
    })

    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)

    # Reload scene matcher
    if scene_matcher:
        scene_matcher.reload()
        SCENE_MATCH_AVAILABLE = scene_matcher.loaded

    print(f"[Backend] Captured position: {position_id} ({len(config['positions'])} total)")
    return {"status": "saved", "position_id": position_id, "total": len(config["positions"])}


@app.get("/capture/positions")
async def get_positions():
    """Get list of all captured positions."""
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            config = json.load(f)
        return config
    return {"room_name": "Demo Room", "positions": []}


@app.get("/health")
async def health():
    return {"status": "ok", "service": "indoor-sense-backend"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
