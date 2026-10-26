# Fallback transcript sources, for when the YouTube subtitle download fails (HTTP 429).
# Writes the same words.json + transcript.txt that parse_vtt.py produces.
#
#   python3 alt_transcript.py yta <VIDEO_ID>   # youtube-transcript-api (needs the package; line-level
#                                              # timings, words spread evenly across each line)
#   python3 alt_transcript.py asr asr.json     # output of asr_transcribe.swift (per-word timings)
import json, sys

def write(words, note):
    words = [(t, w) for t, w in words if w]
    json.dump([[round(t, 2), w] for t, w in words], open("words.json", "w"))
    out, cur_start, cur = [], None, []
    for t, w in words:
        if cur_start is None:
            cur_start = t
        cur.append(w)
        if t - cur_start >= 25:
            out.append((cur_start, " ".join(cur))); cur_start, cur = None, []
    if cur:
        out.append((cur_start, " ".join(cur)))
    with open("transcript.txt", "w") as f:
        for t, line in out:
            f.write(f"[{int(t//60):03d}:{int(t%60):02d}] {line}\n")
    print(f"{len(words)} words, {len(out)} chunks, last t={words[-1][0]:.0f}s ({note})")

def yta(video_id):
    from youtube_transcript_api import YouTubeTranscriptApi
    try:  # v1.x API
        segs = [{"start": s.start, "dur": s.duration, "text": s.text}
                for s in YouTubeTranscriptApi().fetch(video_id, languages=["en"])]
    except AttributeError:  # pre-1.0 API
        segs = [{"start": s["start"], "dur": s["duration"], "text": s["text"]}
                for s in YouTubeTranscriptApi.get_transcript(video_id, languages=["en"])]
    json.dump(segs, open("yta_transcript.json", "w"))
    words = []
    for i, s in enumerate(segs):
        ws = s["text"].replace("\n", " ").split()
        if not ws:
            continue
        end = segs[i+1]["start"] if i+1 < len(segs) else s["start"] + s["dur"]
        span = max(end - s["start"], 0.1)
        words += [(s["start"] + span * k / len(ws), w) for k, w in enumerate(ws)]
    write(words, "youtube-transcript-api, interpolated word times")

def asr(path):
    write([(s, w.strip()) for s, e, w in json.load(open(path))], "on-device ASR")

if __name__ == "__main__":
    {"yta": yta, "asr": asr}[sys.argv[1]](sys.argv[2])
