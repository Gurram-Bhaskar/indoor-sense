import { useLiveAPI } from '../contexts/LiveAPIContext.jsx';
import { useEffect, useRef } from 'react';

export default function VideoFeed() {
  const { videoRef, canvasRef } = useLiveAPI();
  const localVideoRef = useRef(null);
  const localCanvasRef = useRef(null);

  useEffect(() => {
    if (videoRef) videoRef.current = localVideoRef.current;
    if (canvasRef) canvasRef.current = localCanvasRef.current;
  }, [videoRef, canvasRef]);

  return (
    <div className="video-section">
      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
      />
      <canvas ref={localCanvasRef} />
    </div>
  );
}
