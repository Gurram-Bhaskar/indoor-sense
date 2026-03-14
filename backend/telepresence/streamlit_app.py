"""
Streamlit WebRTC Telepresence Dashboard.
Run with: streamlit run streamlit_app.py --server.port 8501
A sighted human assistant sees the user's camera feed and can speak to them.
"""

import streamlit as st
from streamlit_webrtc import webrtc_streamer, WebRtcMode

st.set_page_config(page_title="Indoor Sense - Human Assistant", layout="wide")

st.title("Human Assistant Dashboard")
st.markdown("A visually impaired user needs your help navigating. You can see their camera and speak to them.")

webrtc_streamer(
    key="telepresence",
    mode=WebRtcMode.SENDRECV,
    media_stream_constraints={"video": True, "audio": True},
    rtc_configuration={"iceServers": [{"urls": ["stun:stun.l.google.com:19302"]}]},
)

st.info("When the user taps 'Call Assistant', their camera feed appears above. Speak to guide them.")
