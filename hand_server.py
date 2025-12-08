import cv2
import asyncio
import json
import numpy as np
import websockets
from websockets.protocol import State
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import time

model_path = "models/hand_landmarker.task"

BaseOptions = mp.tasks.BaseOptions
HandLandmarker = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

options = HandLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=model_path),
    running_mode=VisionRunningMode.VIDEO,
    num_hands=2,
    min_hand_detection_confidence=0.5,
    min_hand_presence_confidence=0.5,
    min_tracking_confidence=0.5,
)

landmarker = HandLandmarker.create_from_options(options)

connected_clients = set()


async def process_request(path, request_headers):
    headers = getattr(request_headers, "headers", request_headers)
    upgrade = headers.get("Upgrade", "").lower()
    if upgrade != "websocket":
        return 400, [], b""
    return None


async def handler(ws):
    print("🔌 Client connected")
    connected_clients.add(ws)
    try:
        async for _ in ws:
            pass
    except Exception:
        pass
    finally:
        connected_clients.discard(ws)
        print("👋 Client disconnected")


async def broadcast(data):
    if not connected_clients:
        return

    msg = json.dumps(data)
    tasks = []

    for ws in list(connected_clients):
        if ws.state == State.CLOSED:
            connected_clients.discard(ws)
            continue
        tasks.append(asyncio.create_task(ws.send(msg)))

    if tasks:
        await asyncio.gather(*tasks, return_exceptions=True)


def fingertip_palm_avg_distance(lm_list):
    """
    Very simple 'fist' heuristic:
    - Look at the 4 non-thumb fingertips.
    - If they are all very close to the palm, we call it a closed fist.
    """
    palm = lm_list[0]
    tip_ids = [8, 12, 16, 20]  # index, middle, ring, pinky tips

    dists = []
    for tid in tip_ids:
        p = lm_list[tid]
        d = np.sqrt((p.x - palm.x) ** 2 + (p.y - palm.y) ** 2 + (p.z - palm.z) ** 2)
        dists.append(d)

    if not dists:
        return 999.0

    return float(sum(dists) / len(dists))


async def video_loop():
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("❌ Cannot open camera")
        return

    print("📸 Camera active")

    while True:
        ok, frame = cap.read()
        if not ok:
            await asyncio.sleep(0.01)
            continue

        frame = cv2.flip(frame, 1)

        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

        ts = int(time.time() * 1000)
        result = landmarker.detect_for_video(mp_image, ts)

        hands_payload = []

        if result.hand_landmarks:
            for i, lm_list in enumerate(result.hand_landmarks):
                if result.handedness and i < len(result.handedness):
                    raw_label = result.handedness[i][0].category_name.lower()
                    if raw_label == "left":
                        label = "right"
                    elif raw_label == "right":
                        label = "left"
                    else:
                        label = raw_label
                else:
                    label = f"hand{i+1}"

                palm = lm_list[0]

                def dist(a, b):
                    return float(
                        np.sqrt(
                            (a.x - b.x) ** 2
                            + (a.y - b.y) ** 2
                            + (a.z - b.z) ** 2
                        )
                    )

                thumb_d = dist(lm_list[4], palm)
                index_d = dist(lm_list[8], palm)
                middle_d = dist(lm_list[12], palm)
                ring_d = dist(lm_list[16], palm)
                pinky_d = dist(lm_list[20], palm)

                avg_tip_dist = fingertip_palm_avg_distance(lm_list)
                is_fist = avg_tip_dist < 0.09

                hands_payload.append(
                    {
                        "label": label, # L/R (from user POV)
                        "thumb": thumb_d,
                        "index": index_d,
                        "middle": middle_d,
                        "ring": ring_d,
                        "pinky": pinky_d,
                        "gesture": "closed_fist" if is_fist else "open",
                        "landmarks": [
                            {"x": float(p.x), "y": float(p.y), "z": float(p.z)}
                            for p in lm_list
                        ],
                    }
                )

        await broadcast({"hands": hands_payload})
        await asyncio.sleep(0.01)


async def main():
    print("🚀 WebSocket running on ws://localhost:8765")
    async with websockets.serve(
        handler,
        "localhost",
        8765,
        process_request=process_request,
    ):
        await video_loop()


asyncio.run(main())
