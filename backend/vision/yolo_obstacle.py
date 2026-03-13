from ultralytics import YOLO

# Load the nano model (it will automatically download a tiny ~6MB file the first time you run it)
model = YOLO("yolov8n.pt")

# Only alert the user about these specific COCO dataset objects
HAZARD_CLASSES = ["person", "chair", "couch", "bed", "dining table", "tv", "laptop", "door"]

def detect_obstacles(image):
    """
    Takes an OpenCV image frame.
    Returns a list of unique detected obstacle strings (e.g., ['chair', 'person']).
    """
    try:
        # verbose=False stops the terminal from getting spammed with text every frame
        results = model(image, verbose=False)
        
        detected_hazards = []
        
        for r in results:
            for box in r.boxes:
                class_id = int(box.cls[0])
                class_name = model.names[class_id]
                
                if class_name in HAZARD_CLASSES:
                    detected_hazards.append(class_name)
        
        # Return a list of unique items
        return list(set(detected_hazards))
        
    except Exception as e:
        print(f"Vision Error (YOLO): {e}")
        return []