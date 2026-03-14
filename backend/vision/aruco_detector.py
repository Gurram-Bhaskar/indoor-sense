import cv2
import cv2.aruco as aruco
import numpy as np

# Initialize ArUco dictionary and parameters
DICTIONARY = aruco.getPredefinedDictionary(aruco.DICT_4X4_100)
PARAMETERS = aruco.DetectorParameters()

# Use new ArucoDetector if available (OpenCV 4.7+), else fall back to legacy API
try:
    _detector = aruco.ArucoDetector(DICTIONARY, PARAMETERS)
    USE_NEW_API = True
except AttributeError:
    _detector = None
    USE_NEW_API = False

print(f"[ArUco] Using {'new ArucoDetector' if USE_NEW_API else 'legacy detectMarkers'} API")


def _preprocess(image):
    """Improve contrast and sharpness before detection."""
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    # Equalise histogram to handle dim/overexposed frames
    gray = cv2.equalizeHist(gray)
    return gray


def detect_marker(image):
    """
    Takes an OpenCV BGR image frame.
    Returns the integer ID of the first detected ArUco marker, or None.
    """
    try:
        gray = _preprocess(image)

        if USE_NEW_API:
            corners, ids, _ = _detector.detectMarkers(gray)
        else:
            corners, ids, _ = aruco.detectMarkers(gray, DICTIONARY, parameters=PARAMETERS)

        if ids is not None and len(ids) > 0:
            return int(ids[0][0])

        return None
    except Exception as e:
        print(f"[ArUco] Detection error: {e}")
        return None
