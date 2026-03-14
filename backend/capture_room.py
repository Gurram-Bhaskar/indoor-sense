"""
Room image capture tool.
Run this to take reference photos from different positions in a room.
Each photo is saved with a position label and exit instructions.

Usage:
  cd backend
  python capture_room.py

Controls:
  - Press 1-6 to capture from that position (see POSITIONS below)
  - Press 'q' to quit
  - Press 's' to show all captured positions
"""

import cv2
import json
import os

ROOM_DATA_DIR = os.path.join(os.path.dirname(__file__), "room_data")
IMAGES_DIR = os.path.join(ROOM_DATA_DIR, "images")
CONFIG_PATH = os.path.join(ROOM_DATA_DIR, "room_config.json")

# Predefined capture positions — customize these for your room
POSITIONS = {
    "1": {
        "id": "near_door",
        "label": "Near the door",
        "description": "Standing near the room entrance door",
        "exit_instruction": "The door is right behind you. Turn around and step forward to exit.",
        "exit_direction": "behind",
    },
    "2": {
        "id": "center",
        "label": "Center of room",
        "description": "Standing in the middle of the room",
        "exit_instruction": "Walk straight ahead about 3 meters toward the door. The door handle is on the right side.",
        "exit_direction": "ahead",
    },
    "3": {
        "id": "near_window",
        "label": "Near the window",
        "description": "Standing by the window, opposite wall from the door",
        "exit_instruction": "Turn around 180 degrees, away from the window. Walk straight about 4 meters to reach the door.",
        "exit_direction": "behind",
    },
    "4": {
        "id": "near_desk",
        "label": "Near the desk",
        "description": "Standing by the desk area",
        "exit_instruction": "Turn left and walk about 2 meters. The door will be on your right.",
        "exit_direction": "left",
    },
    "5": {
        "id": "far_corner",
        "label": "Far corner",
        "description": "Standing in the far corner of the room",
        "exit_instruction": "Walk diagonally toward the light from the corridor. The door is about 4 meters ahead and to your left.",
        "exit_direction": "ahead-left",
    },
    "6": {
        "id": "near_bed",
        "label": "Near the bed/couch",
        "description": "Standing near the bed or seating area",
        "exit_instruction": "Step away from the bed. Turn right and walk 3 meters to reach the door.",
        "exit_direction": "right",
    },
}


def main():
    os.makedirs(IMAGES_DIR, exist_ok=True)

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Cannot open camera")
        return

    print("\n=== Room Image Capture Tool ===")
    print("Point your camera at different positions in the room.")
    print("\nPress a number to capture from that position:")
    for key, pos in POSITIONS.items():
        print(f"  [{key}] {pos['label']} — {pos['description']}")
    print("  [s] Show captured positions")
    print("  [q] Quit and save\n")

    captured = {}

    # Load existing config if any
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH) as f:
            existing = json.load(f)
            captured = {p["id"]: p for p in existing.get("positions", [])}
            print(f"Loaded {len(captured)} existing positions")

    while True:
        ret, frame = cap.read()
        if not ret:
            continue

        # Show overlay
        display = frame.copy()
        cv2.putText(display, "Room Capture — Press 1-6 to capture, Q to quit",
                     (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

        y = 60
        for key, pos in POSITIONS.items():
            status = "CAPTURED" if pos["id"] in captured else "---"
            color = (0, 255, 0) if pos["id"] in captured else (0, 0, 255)
            cv2.putText(display, f"[{key}] {pos['label']}: {status}",
                         (10, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)
            y += 25

        cv2.imshow("Room Capture", display)
        key = cv2.waitKey(1) & 0xFF

        if key == ord("q"):
            break
        elif key == ord("s"):
            print(f"\nCaptured positions: {list(captured.keys())}")
        elif chr(key) in POSITIONS:
            pos = POSITIONS[chr(key)]
            img_path = os.path.join(IMAGES_DIR, f"{pos['id']}.jpg")
            cv2.imwrite(img_path, frame)
            captured[pos["id"]] = {
                "id": pos["id"],
                "label": pos["label"],
                "description": pos["description"],
                "exit_instruction": pos["exit_instruction"],
                "exit_direction": pos["exit_direction"],
                "image": f"images/{pos['id']}.jpg",
            }
            print(f"  Captured: {pos['label']} -> {img_path}")

    cap.release()
    cv2.destroyAllWindows()

    # Save config
    config = {
        "room_name": "Demo Room",
        "positions": list(captured.values()),
    }
    with open(CONFIG_PATH, "w") as f:
        json.dump(config, f, indent=2)

    print(f"\nSaved {len(captured)} positions to {CONFIG_PATH}")
    print("Done! Run the backend server to enable room-aware navigation.")


if __name__ == "__main__":
    main()
