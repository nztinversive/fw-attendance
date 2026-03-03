"""
FW Attendance — Quick Face Recognition Demo
=============================================
Press 'e' to enroll the current face (prompts for name in terminal).
Press 'r' to reset all enrolled faces.
Press 'q' to quit.

No liveness check — pure recognition speed demo.
"""

import cv2
import face_recognition
import numpy as np
import time
from datetime import datetime

# ─── State ───────────────────────────────────────────────────────
known_encodings: list[np.ndarray] = []
known_names: list[str] = []
last_clock: dict[str, float] = {}
COOLDOWN = 10  # seconds between repeat clock-ins

# ─── Colors (BGR) ────────────────────────────────────────────────
GREEN = (0, 220, 0)
RED = (0, 0, 220)
GOLD = (11, 134, 184)
WHITE = (255, 255, 255)
DARK = (30, 30, 30)
FONT = cv2.FONT_HERSHEY_SIMPLEX

# ─── Banner Messages ─────────────────────────────────────────────
banner_text = ""
banner_color = GOLD
banner_until = 0.0


def set_banner(text: str, color=GOLD, duration=3.0):
    global banner_text, banner_color, banner_until
    banner_text = text
    banner_color = color
    banner_until = time.time() + duration


def enroll_face(frame: np.ndarray):
    """Enroll the largest face in the current frame."""
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    locations = face_recognition.face_locations(rgb, model="hog")
    if not locations:
        set_banner("No face detected — look at the camera", RED)
        return

    encodings = face_recognition.face_encodings(rgb, locations)
    if not encodings:
        set_banner("Could not encode face — try again", RED)
        return

    # Show the frame with a prompt overlay so user knows it captured
    cv2.imshow("FW Attendance Demo", frame)
    cv2.waitKey(1)

    name = input("\n  Enter name for enrollment: ").strip()
    if not name:
        set_banner("Enrollment cancelled", RED)
        return

    # Check if name already exists — update encoding
    if name in known_names:
        idx = known_names.index(name)
        known_encodings[idx] = encodings[0]
        set_banner(f"Updated: {name}", GREEN, 4.0)
    else:
        known_encodings.append(encodings[0])
        known_names.append(name)
        set_banner(f"Enrolled: {name} ({len(known_names)} total)", GREEN, 4.0)

    print(f"  ✅ Enrolled {name} — {len(known_names)} face(s) in database")


def main():
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Cannot open camera")
        return

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    print("\n" + "=" * 55)
    print("  ⚡ FW Attendance — Face Recognition Demo")
    print("=" * 55)
    print("  [e] Enroll face    [r] Reset all    [q] Quit")
    print("=" * 55 + "\n")

    set_banner("Press 'e' to enroll a face", GOLD, 5.0)

    # Process every other frame for speed
    frame_count = 0
    cached_results: list[tuple] = []  # (location, name, confidence)

    while True:
        ret, frame = cap.read()
        if not ret:
            time.sleep(0.05)
            continue

        h, w = frame.shape[:2]
        now = time.time()
        frame_count += 1

        # Run recognition every 3rd frame for smooth video
        if frame_count % 3 == 0 and known_encodings:
            small = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
            rgb_small = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
            locations = face_recognition.face_locations(rgb_small, model="hog")

            cached_results = []
            if locations:
                encodings = face_recognition.face_encodings(rgb_small, locations)
                for loc, enc in zip(locations, encodings):
                    distances = face_recognition.face_distance(known_encodings, enc)
                    best_idx = int(np.argmin(distances))
                    best_dist = float(distances[best_idx])
                    confidence = max(0.0, 1.0 - best_dist)

                    # Scale location back to full size
                    top, right, bottom, left = [v * 2 for v in loc]

                    if best_dist <= 0.5:
                        name = known_names[best_idx]
                        cached_results.append(((top, right, bottom, left), name, confidence))
                    else:
                        cached_results.append(((top, right, bottom, left), None, confidence))

        # Draw face boxes
        for (top, right, bottom, left), name, confidence in cached_results:
            if name:
                color = GREEN
                label = f"{name} ({confidence:.0%})"

                # Clock-in logic
                last = last_clock.get(name, 0)
                if now - last > COOLDOWN:
                    last_clock[name] = now
                    time_str = datetime.now().strftime("%I:%M %p")
                    set_banner(f"Welcome, {name}! Clocked in at {time_str}", GREEN, 3.0)
                    print(f"  🟢 {name} clocked in at {time_str} ({confidence:.0%})")
            else:
                color = RED
                label = f"Unknown ({confidence:.0%})"

            # Face box
            cv2.rectangle(frame, (left, top), (right, bottom), color, 2)

            # Label background
            label_h = 25
            cv2.rectangle(frame, (left, top - label_h), (right, top), color, -1)
            cv2.putText(frame, label, (left + 4, top - 6), FONT, 0.5, WHITE, 1)

        # If no enrolled faces, show detection boxes in gold
        if not known_encodings and frame_count % 3 == 0:
            small = cv2.resize(frame, (0, 0), fx=0.5, fy=0.5)
            rgb_small = cv2.cvtColor(small, cv2.COLOR_BGR2RGB)
            locations = face_recognition.face_locations(rgb_small, model="hog")
            cached_results = []
            for loc in locations:
                top, right, bottom, left = [v * 2 for v in loc]
                cv2.rectangle(frame, (left, top), (right, bottom), GOLD, 2)

        # ─── HUD ─────────────────────────────────────────────
        # Top bar
        cv2.rectangle(frame, (0, 0), (w, 40), DARK, -1)
        cv2.putText(frame, "FW Attendance", (10, 28), FONT, 0.7, GOLD, 2)
        time_str = datetime.now().strftime("%I:%M:%S %p")
        cv2.putText(frame, time_str, (w - 180, 28), FONT, 0.6, WHITE, 1)

        # Face count badge
        count_text = f"Enrolled: {len(known_names)}"
        cv2.putText(frame, count_text, (w // 2 - 40, 28), FONT, 0.5, GREEN if known_names else RED, 1)

        # Bottom banner
        cv2.rectangle(frame, (0, h - 45), (w, h), DARK, -1)
        if banner_text and now < banner_until:
            cv2.putText(frame, banner_text, (10, h - 14), FONT, 0.6, banner_color, 2)
        else:
            hint = "[e] Enroll  [r] Reset  [q] Quit"
            cv2.putText(frame, hint, (10, h - 14), FONT, 0.5, GOLD, 1)

        cv2.imshow("FW Attendance Demo", frame)

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        elif key == ord("e"):
            enroll_face(frame)
        elif key == ord("r"):
            known_encodings.clear()
            known_names.clear()
            last_clock.clear()
            cached_results.clear()
            set_banner("All faces cleared", RED, 3.0)
            print("  🔴 All enrolled faces cleared")

    cap.release()
    cv2.destroyAllWindows()
    print("\n  Demo ended. Enrolled faces were not saved.\n")


if __name__ == "__main__":
    main()
