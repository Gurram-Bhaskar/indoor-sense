import cv2
import cv2.aruco as aruco

# Initialize the ArUco dictionary (DICT_4X4_100 per project spec)
try:
    DICTIONARY = aruco.getPredefinedDictionary(aruco.DICT_4X4_100)
    PARAMETERS = aruco.DetectorParameters()
except AttributeError:
    DICTIONARY = aruco.Dictionary_get(aruco.DICT_4X4_100)
    PARAMETERS = aruco.DetectorParameters_create()

def detect_marker(image):
    """
    Takes an OpenCV image frame.
    Returns the integer ID of the detected marker, or None if no marker is found.
    """
    try:
        # Convert to grayscale to make detection faster and more reliable
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        
        # Detect the markers
        corners, ids, rejected = aruco.detectMarkers(gray, DICTIONARY, parameters=PARAMETERS)
        
        if ids is not None and len(ids) > 0:
            return int(ids[0][0])
            
        return None
    except Exception as e:
        print(f"Vision Error (ArUco): {e}")
        return None