import re, json, sys

# Parse YouTube auto-sub VTT (rolling captions) into deduped timed words,
# then group into ~25s chunks for reading.
path = "source.en.vtt"
text = open(path).read()

# Extract <ts><c> word</c> patterns plus cue start lines
word_re = re.compile(r"<(\d\d):(\d\d):(\d\d)\.(\d\d\d)><c>([^<]+)</c>")
cue_re = re.compile(r"(\d\d):(\d\d):(\d\d)\.(\d\d\d) --> ")

words = []  # (t, word)
for block in text.split("\n\n"):
    m = cue_re.search(block)
    if not m:
        continue
    cue_start = int(m[1])*3600 + int(m[2])*60 + int(m[3]) + int(m[4])/1000
    # lines with inline word timings
    for line in block.split("\n"):
        if "<c>" not in line and "-->" in line:
            continue
        if "<" in line and ">" in line:
            # first word of line has no timestamp tag; attach cue_start
            lead = re.match(r"^([^<]+)<", line)
            if lead and lead[1].strip():
                words.append((cue_start, lead[1].strip()))
            for mm in word_re.finditer(line):
                t = int(mm[1])*3600 + int(mm[2])*60 + int(mm[3]) + int(mm[4])/1000
                w = mm[5].replace("</c>", "").strip()
                if w:
                    words.append((t, w))

# dedupe consecutive (rolling repeats): keep monotonically increasing, drop exact repeats at same t
seen = set()
clean = []
for t, w in words:
    key = (round(t, 2), w)
    if key in seen:
        continue
    seen.add(key)
    clean.append((t, w))
clean.sort(key=lambda x: x[0])

json.dump([[round(t,2), w] for t, w in clean], open("words.json", "w"))

# chunk into ~25s readable lines
out = []
cur_start, cur = None, []
for t, w in clean:
    if cur_start is None:
        cur_start = t
    cur.append(w)
    if t - cur_start >= 25:
        out.append((cur_start, " ".join(cur)))
        cur_start, cur = None, []
if cur:
    out.append((cur_start, " ".join(cur)))

with open("transcript.txt", "w") as f:
    for t, line in out:
        mm, ss = int(t//60), int(t%60)
        f.write(f"[{mm:03d}:{ss:02d}] {line}\n")

print(f"{len(clean)} words, {len(out)} chunks, last t={clean[-1][0]:.0f}s")
