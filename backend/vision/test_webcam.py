import cv2
from aruco_detector import detect_marker
from yolo_obstacle import detect_obstacles

def main():
    # 0 is usually the default built-in Windows webcam
    cap = cv2.VideoCapture(0) 

    if not cap.isOpened():
        print("Error: Could not open Windows webcam.")
        return

    print("Starting webcam... Press 'q' to quit.")

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # 1. Test ArUco Detection
        marker_id = detect_marker(frame)
        if marker_id is not None:
            cv2.putText(frame, f"Marker: {marker_id}", (20, 50), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 3)

        # 2. Test YOLO Obstacle Detection
        obstacles = detect_obstacles(frame)
        if obstacles:
            y_pos = 100
            for obj in obstacles:
                cv2.putText(frame, f"Hazard: {obj}", (20, y_pos), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 0, 255), 2)
                y_pos += 30

        # Show the live feed on your screen
        cv2.imshow("Vision Lead Test - Press 'q' to quit", frame)

        # Break the loop if 'q' is pressed
        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()

if __name__ == "__main__":
    main()