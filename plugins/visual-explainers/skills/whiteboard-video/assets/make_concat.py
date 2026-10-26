#!/usr/bin/env python3
"""Build ffmpeg concat file (frames.txt) from shots.json.
Usage: python3 make_concat.py <video_duration_seconds>"""
import json, sys

DUR = float(sys.argv[1])
shots = json.load(open('shots.json'))
with open('frames.txt', 'w') as f:
    for i, t in enumerate(shots):
        end = shots[i + 1] if i + 1 < len(shots) else DUR
        name = f"frames/f{round(t*100):07d}.png"
        f.write(f"file '{name}'\nduration {end - t:.3f}\n")
    f.write(f"file 'frames/f{round(shots[-1]*100):07d}.png'\n")
print(f"frames.txt written: {len(shots)} frames covering 0..{DUR}s")
