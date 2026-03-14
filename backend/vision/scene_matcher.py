"""
Scene matcher using ORB feature matching.
Compares live camera frames against stored reference images to determine
the user's position within a room.
"""

import os
import json
import cv2
import numpy as np

ROOM_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "room_data")
CONFIG_PATH = os.path.join(ROOM_DATA_DIR, "room_config.json")

# ORB detector and brute-force matcher
orb = cv2.ORB_create(nFeatures=500)
bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)


class SceneMatcher:
    def __init__(self):
        self.positions = []
        self.descriptors = {}  # position_id -> (keypoints, descriptors)
        self.loaded = False
        self._load()

    def _load(self):
        """Load room config and precompute ORB descriptors for all reference images."""
        if not os.path.exists(CONFIG_PATH):
            print("[SceneMatcher] No room_config.json found — scene matching disabled")
            return

        with open(CONFIG_PATH) as f:
            config = json.load(f)

        self.positions = config.get("positions", [])

        for pos in self.positions:
            img_path = os.path.join(ROOM_DATA_DIR, pos["image"])
            if not os.path.exists(img_path):
                print(f"[SceneMatcher] Missing image: {img_path}")
                continue

            img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
            if img is None:
                continue

            # Resize to standard size for consistent matching
            img = cv2.resize(img, (640, 480))
            kp, des = orb.detectAndCompute(img, None)

            if des is not None:
                self.descriptors[pos["id"]] = (kp, des)

        self.loaded = len(self.descriptors) > 0
        print(f"[SceneMatcher] Loaded {len(self.descriptors)} reference positions")

    def match(self, frame, min_matches=15):
        """
        Match a live frame against stored references.
        Returns the best matching position dict, or None.
        """
        if not self.loaded:
            return None

        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = cv2.resize(gray, (640, 480))
        kp_live, des_live = orb.detectAndCompute(gray, None)

        if des_live is None:
            return None

        best_match = None
        best_count = 0

        for pos in self.positions:
            if pos["id"] not in self.descriptors:
                continue

            _, des_ref = self.descriptors[pos["id"]]

            try:
                matches = bf.match(des_live, des_ref)
                # Filter good matches by distance
                good = [m for m in matches if m.distance < 60]
                count = len(good)

                if count > best_count and count >= min_matches:
                    best_count = count
                    best_match = pos
            except cv2.error:
                continue

        if best_match:
            return {
                "position_id": best_match["id"],
                "label": best_match["label"],
                "description": best_match["description"],
                "exit_instruction": best_match["exit_instruction"],
                "exit_direction": best_match["exit_direction"],
                "confidence": best_count,
            }

        return None

    def reload(self):
        """Reload config and references (call after capturing new images)."""
        self.positions = []
        self.descriptors = {}
        self.loaded = False
        self._load()
