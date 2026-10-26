#!/usr/bin/env python3
"""Render a Claude Code session transcript as a Braintrust-style HTML trace viewer.

Usage:
    render-trace.py <root.jsonl> --out <file.html> [--title ...] [--report <report.html>]

The root may be a session file (<session-id>.jsonl) or a subagent file
(<session-id>/subagents/agent-<agent-id>.jsonl). Every `Agent` tool call is
followed into its child transcript and nested as a collapsible child span.

stdlib only. All strings are redacted before they reach the html.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys
from collections import Counter, OrderedDict

# --------------------------------------------------------------------------
# Redaction. Applied to EVERY string that reaches the html.
# --------------------------------------------------------------------------

# Email domains left unredacted. Set TRACE_ALLOWED_EMAIL_DOMAINS to a
# comma-separated list (eg your own work domain) to keep those readable.
ALLOWED_EMAIL_DOMAINS = tuple(
    d.strip().lower()
    for d in os.environ.get("TRACE_ALLOWED_EMAIL_DOMAINS", "").split(",")
    if d.strip())

_RE_JWT = re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")
# A bare JOSE header with no dotted body -- a JWT the transcript already cut
# short. base64("{\"alg\"|\"kid\"|\"typ\"|\"enc\"|\"jku\"...") all start eyJ<x>.
# Deliberately narrow so ordinary base64-JSON (eg Notion page cursors) survives.
_RE_JWT_HEAD = re.compile(
    r"\beyJ(?:hbGci|raWQ|0eXAi|lbmMi|qa3Ui|4NWMi|jdHki)[A-Za-z0-9_-]{5,}")
_RE_BEARER = re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._\-~+/=]{8,}")
_RE_SHOPIFY = re.compile(r"\bshp(at|ca|ss)_[A-Za-z0-9]{8,}")
_RE_AWSKEY = re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{8,}")
# secret-looking values following a SecretAccessKey / SessionToken label, in
# json ("SecretAccessKey": "..."), env (AWS_SECRET_ACCESS_KEY=...) or cli forms.
_RE_AWS_SECRET = re.compile(
    r"(?i)((?:aws_)?(?:secret_?access_?key|session_?token)[\"']?\s*[:=]\s*[\"']?)"
    r"([A-Za-z0-9/+=_\-]{16,})"
)
_RE_SK = re.compile(r"\bsk-[A-Za-z0-9_\-]{12,}")
_RE_PK = re.compile(r"\bpk_[A-Za-z0-9_\-]{12,}")
_RE_XOX = re.compile(r"\bxox[abp]-[A-Za-z0-9\-]{8,}")
_RE_EMAIL = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")

REDACTION_STATS: Counter = Counter()


def _tag(kind: str) -> str:
    REDACTION_STATS[kind] += 1
    return "[redacted:%s]" % kind


def _email_sub(m: re.Match) -> str:
    addr = m.group(0)
    dom = addr.rsplit("@", 1)[-1].lower()
    for allowed in ALLOWED_EMAIL_DOMAINS:
        if dom == allowed or dom.endswith("." + allowed):
            return addr
    return _tag("email")


def redact(s):
    """Redact credentials out of a string. Non-strings pass through."""
    if not isinstance(s, str) or not s:
        return s
    s = _RE_JWT.sub(lambda m: _tag("jwt"), s)
    s = _RE_JWT_HEAD.sub(lambda m: _tag("jwt-fragment"), s)
    s = _RE_SHOPIFY.sub(lambda m: _tag("shopify-token"), s)
    s = _RE_AWSKEY.sub(lambda m: _tag("aws-key-id"), s)
    s = _RE_AWS_SECRET.sub(lambda m: m.group(1) + _tag("aws-secret"), s)
    s = _RE_BEARER.sub(lambda m: "Bearer " + _tag("bearer"), s)
    s = _RE_SK.sub(lambda m: _tag("api-key"), s)
    s = _RE_PK.sub(lambda m: _tag("api-key"), s)
    s = _RE_XOX.sub(lambda m: _tag("slack-token"), s)
    s = _RE_EMAIL.sub(_email_sub, s)
    return s


def redact_deep(obj):
    if isinstance(obj, str):
        return redact(obj)
    if isinstance(obj, list):
        return [redact_deep(x) for x in obj]
    if isinstance(obj, dict):
        return {redact(k): redact_deep(v) for k, v in obj.items()}
    return obj


# --------------------------------------------------------------------------
# Transcript loading
# --------------------------------------------------------------------------

MAX_PAYLOAD = 12 * 1024  # bytes of raw payload kept per span


def load_jsonl(path):
    recs = []
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                recs.append(json.loads(line))
            except ValueError:
                continue
    return recs


def parse_ts(ts):
    """ISO-8601 with Z -> epoch seconds (float). None on failure."""
    if not ts or not isinstance(ts, str):
        return None
    try:
        import datetime

        t = ts.replace("Z", "+00:00")
        return datetime.datetime.fromisoformat(t).timestamp()
    except Exception:
        return None


def fmt_clock(ts):
    if not ts:
        return "?"
    import datetime

    try:
        t = datetime.datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return t.strftime("%Y-%m-%d %H:%M:%SZ")
    except Exception:
        return ts


def blocks_of(rec):
    m = rec.get("message")
    if not isinstance(m, dict):
        return []
    c = m.get("content")
    if isinstance(c, str):
        return [{"type": "text", "text": c}]
    if isinstance(c, list):
        return [b for b in c if isinstance(b, dict)]
    return []


def text_of_result(block):
    """Flatten a tool_result content payload to text."""
    c = block.get("content")
    if isinstance(c, str):
        return c
    out = []
    if isinstance(c, list):
        for b in c:
            if not isinstance(b, dict):
                out.append(json.dumps(b))
            elif b.get("type") == "text":
                out.append(b.get("text") or "")
            elif b.get("type") == "image":
                src = b.get("source") or {}
                out.append("[image: %s, %s bytes base64]"
                           % (src.get("media_type", "?"), len(src.get("data") or "")))
            else:
                out.append(json.dumps(b)[:2000])
    elif c is not None:
        out.append(json.dumps(c))
    return "\n".join(out)


def pretty(obj):
    if isinstance(obj, str):
        return obj
    try:
        return json.dumps(obj, indent=2, ensure_ascii=False)
    except Exception:
        return str(obj)


def clip(s):
    """Cap a payload at MAX_PAYLOAD, returning (text, omitted_kb)."""
    if s is None:
        return "", 0
    b = s.encode("utf-8", "replace")
    if len(b) <= MAX_PAYLOAD:
        return s, 0
    kept = b[:MAX_PAYLOAD].decode("utf-8", "ignore")
    return kept, round((len(b) - MAX_PAYLOAD) / 1024.0, 1)


# --------------------------------------------------------------------------
# Tool input one-line summaries
# --------------------------------------------------------------------------

def tool_summary(name, inp):
    if not isinstance(inp, dict):
        return (str(inp) or "")[:160]
    def g(*keys):
        for k in keys:
            v = inp.get(k)
            if isinstance(v, str) and v.strip():
                return v.strip()
        return None
    if name == "Bash":
        v = g("command") or ""
        return " ".join(v.split())[:200]
    if name in ("Read", "Write", "NotebookEdit"):
        return (g("file_path", "notebook_path") or "")[:200]
    if name == "Edit":
        return "%s  ::  %s" % ((g("file_path") or "")[:120],
                               " ".join((g("old_string") or "").split())[:70])
    if name in ("Grep", "Glob"):
        return "%s  in %s" % (g("pattern") or "", g("path") or ".")
    if name == "Agent":
        return "%s [%s/%s] %s" % (g("description") or "", inp.get("subagent_type") or "?",
                                  inp.get("model") or "?", ("name=" + g("name")) if g("name") else "")
    if name == "SendMessage":
        return "to %s: %s" % (inp.get("to") or "?",
                              " ".join((g("message") or "").split())[:150])
    if name == "Skill":
        return "%s %s" % (g("skill") or "", g("args") or "")
    if name == "ToolSearch":
        return g("query") or ""
    if name == "Task":
        return g("description") or ""
    if name == "Artifact":
        return "%s %s" % (inp.get("action") or "publish", g("file_path", "url") or "")
    if name == "WebFetch" or name == "WebSearch":
        return g("url", "query") or ""
    # generic / mcp
    parts = []
    for k, v in list(inp.items())[:4]:
        sv = v if isinstance(v, str) else json.dumps(v)
        parts.append("%s=%s" % (k, " ".join(sv.split())[:60]))
    return "  ".join(parts)[:220]


# --------------------------------------------------------------------------
# Agent linkage
# --------------------------------------------------------------------------

def subagent_dir_for(root_path):
    """Return the subagents/ directory that belongs to this transcript."""
    root_path = os.path.abspath(root_path)
    d = os.path.dirname(root_path)
    if os.path.basename(d) == "subagents":
        return d
    base = os.path.basename(root_path)
    if base.endswith(".jsonl"):
        cand = os.path.join(d, base[:-6], "subagents")
        if os.path.isdir(cand):
            return cand
    return None


def load_agent_index(subdir):
    """agentId -> path, and name -> path, from the *.meta.json sidecars."""
    by_id, by_name, by_tooluse, meta_by_id = {}, {}, {}, {}
    if not subdir or not os.path.isdir(subdir):
        return by_id, by_name, by_tooluse, meta_by_id
    for fn in sorted(os.listdir(subdir)):
        if not fn.endswith(".jsonl"):
            continue
        agent_id = fn[len("agent-"):-len(".jsonl")] if fn.startswith("agent-") else fn[:-6]
        path = os.path.join(subdir, fn)
        by_id[agent_id] = path
        meta_path = os.path.join(subdir, fn[:-6] + ".meta.json")
        meta = {}
        if os.path.exists(meta_path):
            try:
                meta = json.load(open(meta_path, "r", encoding="utf-8"))
            except Exception:
                meta = {}
        meta_by_id[agent_id] = meta
        nm = meta.get("name") or meta.get("agentType")
        if nm:
            by_name.setdefault(nm, path)
        tui = meta.get("toolUseId")
        if tui:
            by_tooluse[tui] = path
    return by_id, by_name, by_tooluse, meta_by_id


def resolve_child(tool_use_id, tool_use_result, index):
    """Work out which child transcript an Agent call produced.

    Order of evidence, strongest first:
      1. toolUseResult.agentId      (subagent spawn, sync or async)
      2. meta.json toolUseId match  (same thing, from the sidecar)
      3. toolUseResult.name         (teammate spawn -- no toolUseId in the meta)
    """
    by_id, by_name, by_tooluse, _ = index
    if isinstance(tool_use_result, dict):
        aid = tool_use_result.get("agentId")
        if aid and aid in by_id:
            return by_id[aid], "toolUseResult.agentId"
        if tool_use_id in by_tooluse:
            return by_tooluse[tool_use_id], "meta.toolUseId"
        nm = tool_use_result.get("name")
        if nm and nm in by_name:
            return by_name[nm], "toolUseResult.name"
    if tool_use_id in by_tooluse:
        return by_tooluse[tool_use_id], "meta.toolUseId"
    return None, None


# --------------------------------------------------------------------------
# Span building
# --------------------------------------------------------------------------

class Builder(object):
    def __init__(self, index, t0=None):
        self.index = index
        self.spans = []
        self.t0 = t0
        self.visited = set()
        self.linkage = Counter()

    def rel(self, ts_epoch):
        if ts_epoch is None or self.t0 is None:
            return None
        return max(0.0, ts_epoch - self.t0)

    def add(self, span):
        span["i"] = len(self.spans)
        self.spans.append(span)
        return span

    def walk(self, path, depth, agent_label, parent_span_idx=None):
        """Parse one transcript file into spans; returns its stats dict."""
        real = os.path.abspath(path)
        if real in self.visited:
            return None
        self.visited.add(real)
        recs = load_jsonl(path)
        if not recs:
            return None

        session_id = None
        agent_id = None
        for r in recs:
            session_id = session_id or r.get("sessionId")
            agent_id = agent_id or r.get("agentId")
            if session_id:
                break

        stats = {
            "tools": Counter(),
            "turns": 0,
            "in": 0, "out": 0, "cache_read": 0, "cache_write": 0,
            "first": None, "last": None,
            "subagents": 0,
            "errors": 0,
            "models": Counter(),
        }
        seen_usage = set()

        # index tool_result records by tool_use_id
        results = {}
        for r in recs:
            if r.get("type") != "user":
                continue
            for b in blocks_of(r):
                if b.get("type") == "tool_result":
                    results[b.get("tool_use_id")] = (b, r)

        if self.t0 is None:
            for r in recs:
                e = parse_ts(r.get("timestamp"))
                if e:
                    self.t0 = e
                    break

        for r in recs:
            rtype = r.get("type")
            ts = r.get("timestamp")
            e = parse_ts(ts)
            if e:
                stats["first"] = stats["first"] or ts
                stats["last"] = ts

            if rtype == "assistant":
                m = r.get("message") or {}
                mid = m.get("id")
                if mid and mid not in seen_usage:
                    seen_usage.add(mid)
                    stats["turns"] += 1
                    u = m.get("usage") or {}
                    stats["in"] += u.get("input_tokens") or 0
                    stats["out"] += u.get("output_tokens") or 0
                    stats["cache_read"] += u.get("cache_read_input_tokens") or 0
                    stats["cache_write"] += u.get("cache_creation_input_tokens") or 0
                if m.get("model"):
                    stats["models"][m["model"]] += 1
                for bi, b in enumerate(blocks_of(r)):
                    bt = b.get("type")
                    sid = "%s:%s:%d" % (agent_id or "root", r.get("uuid"), bi)
                    if bt == "text":
                        body = b.get("text") or ""
                        if not body.strip():
                            continue
                        txt, om = clip(redact(body))
                        self.add(dict(k="text", n="assistant", d=depth, ts=ts,
                                      t=self.rel(e), a=agent_label, sid=sid,
                                      s=redact(" ".join(body.split())[:180]),
                                      out=txt, outOm=om, sz=len(body)))
                    elif bt == "thinking":
                        body = b.get("thinking") or b.get("text") or ""
                        if not body.strip():
                            continue
                        txt, om = clip(redact(body))
                        self.add(dict(k="thinking", n="thinking", d=depth, ts=ts,
                                      t=self.rel(e), a=agent_label, sid=sid,
                                      s=redact(" ".join(body.split())[:180]),
                                      out=txt, outOm=om, sz=len(body)))
                    elif bt == "tool_use":
                        self.tool_span(b, r, results, depth, agent_label, stats, sid, e)

            elif rtype == "user":
                bl = blocks_of(r)
                is_result = any(b.get("type") == "tool_result" for b in bl)
                if is_result:
                    continue  # folded into its tool span
                if r.get("isMeta"):
                    continue
                body = "\n".join(b.get("text") or "" for b in bl if b.get("type") == "text")
                if not body.strip():
                    continue
                kind = "user"
                label = "user"
                if body.startswith("<task-notification>"):
                    kind, label = "system", "task-notification"
                elif body.startswith("<bash-input>") or body.startswith("<bash-stdout>"):
                    kind, label = "system", "bash-mode"
                elif r.get("isCompactSummary"):
                    kind, label = "compaction", "compact summary"
                txt, om = clip(redact(body))
                sid = "%s:%s:u" % (agent_id or "root", r.get("uuid"))
                self.add(dict(k=kind, n=label, d=depth, ts=ts, t=self.rel(e),
                              a=agent_label, sid=sid,
                              s=redact(" ".join(body.split())[:180]),
                              out=txt, outOm=om, sz=len(body)))

            elif rtype == "system":
                sub = r.get("subtype") or "system"
                if sub == "compact_boundary":
                    cm = r.get("compactMetadata") or {}
                    s = ("compaction (%s): %s tokens in -> %s after, %s dropped"
                         % (cm.get("trigger"), cm.get("preTokens"),
                            cm.get("postTokens"), cm.get("cumulativeDroppedTokens")))
                    body = pretty(redact_deep(cm))
                    kind = "compaction"
                else:
                    body = pretty(redact_deep({k: v for k, v in r.items()
                                               if k not in ("cwd", "gitBranch", "version",
                                                            "userType", "entrypoint")}))
                    s = redact(" ".join(str(r.get("content") or r.get("summary") or sub).split())[:180])
                    kind = "system"
                txt, om = clip(body)
                sid = "%s:%s:s" % (agent_id or "root", r.get("uuid"))
                self.add(dict(k=kind, n=sub, d=depth, ts=ts, t=self.rel(e),
                              a=agent_label, sid=sid, s=s, out=txt, outOm=om,
                              sz=len(body)))

        stats["subagents"] = sum(1 for s in self.spans
                                 if s.get("k") == "agent" and s.get("parentAgent") == agent_label)
        return stats

    def tool_span(self, b, rec, results, depth, agent_label, stats, sid, e):
        name = b.get("name") or "?"
        tuid = b.get("id")
        inp = b.get("input")
        stats["tools"][name] += 1
        res = results.get(tuid)
        dur = None
        out_text = ""
        is_err = False
        if res:
            rb, rr = res
            out_text = text_of_result(rb)
            is_err = bool(rb.get("is_error"))
            re_ = parse_ts(rr.get("timestamp"))
            if re_ and e:
                dur = max(0.0, re_ - e)
            tur = rr.get("toolUseResult")
            if isinstance(tur, dict) and not out_text:
                out_text = pretty(tur)
            if isinstance(tur, str) and not out_text:
                out_text = tur
            if isinstance(tur, dict):
                if tur.get("stderr") and not tur.get("stdout"):
                    pass
                if tur.get("interrupted"):
                    is_err = True
        else:
            out_text = "(no result recorded)"
        if is_err:
            stats["errors"] += 1

        in_pretty = pretty(redact_deep(inp))
        in_txt, in_om = clip(in_pretty)
        out_txt, out_om = clip(redact(out_text))

        kind = "agent" if name == "Agent" else "tool"
        span = self.add(dict(k=kind, n=name, d=depth, ts=rec.get("timestamp"),
                             t=self.rel(e), a=agent_label, sid=sid,
                             s=redact(tool_summary(name, inp)),
                             inp=in_txt, inOm=in_om,
                             out=out_txt, outOm=out_om,
                             dur=round(dur, 2) if dur is not None else None,
                             sz=len(out_text), err=is_err,
                             parentAgent=agent_label))

        if name == "Agent":
            tur = results.get(tuid, (None, {}))[1].get("toolUseResult") if res else None
            child_path, how = resolve_child(tuid, tur, self.index)
            if child_path and os.path.abspath(child_path) not in self.visited:
                self.linkage[how] += 1
                child_label = os.path.basename(child_path)[len("agent-"):-len(".jsonl")]
                span["child"] = child_label
                span["childHow"] = how
                child_stats = self.walk(child_path, depth + 1, child_label, span["i"])
                if child_stats:
                    span["cstats"] = summarize(child_stats)
                    for k2 in ("in", "out", "cache_read", "cache_write", "turns"):
                        stats[k2] += child_stats[k2]
                    stats["tools"].update(child_stats["tools"])
            elif child_path:
                span["child"] = "(already rendered)"


def summarize(st):
    return {
        "turns": st["turns"],
        "tools": sum(st["tools"].values()),
        "tokens": st["in"] + st["out"],
        "in": st["in"], "out": st["out"],
        "cache_read": st["cache_read"], "cache_write": st["cache_write"],
        "first": st["first"], "last": st["last"],
        "errors": st["errors"],
        "top": st["tools"].most_common(6),
    }


# --------------------------------------------------------------------------
# Findings: parse finding titles out of the report html
# --------------------------------------------------------------------------

STOPWORDS = set("""a an the and or but of in on for to from with without at by as is are was
were be been being it its this that these those their there here what which who whom how why
when where not no nor so than then too very can could should would may might must will just
about into over under after before again more most other some such only own same s t don now
you your we our they them he she his her i me my up down out off all any both each few
more one two three new make made get got give given show shows shown need needs run runs
had has have do does did doing use used using sell sells sold buy buys ads ad""".split())


def parse_findings(report_path, section_re=r"suggestion|recommendation|finding"):
    try:
        src = open(report_path, "r", encoding="utf-8", errors="replace").read()
    except Exception as exc:
        sys.stderr.write("warn: could not read report %s: %s\n" % (report_path, exc))
        return []
    # Walk headings in document order; collect h3s inside the h2 section whose
    # title matches section_re (by default "suggestion", "recommendation" or
    # "finding").
    heads = []
    for m in re.finditer(r"<(h[123])\b[^>]*>(.*?)</\1>", src, re.S | re.I):
        text = html.unescape(re.sub(r"<[^>]+>", " ", m.group(2)))
        text = " ".join(text.split())
        heads.append((m.group(1).lower(), text, m.end()))

    findings = []
    inside = False
    for i, (tag, text, end) in enumerate(heads):
        if tag == "h2":
            inside = bool(re.search(section_re, text, re.I))
            continue
        if tag == "h3" and inside and text:
            nxt = heads[i + 1][2] if i + 1 < len(heads) else len(src)
            # take the body under this heading for extra keywords (numbers, names)
            body = html.unescape(re.sub(r"<[^>]+>", " ", src[end:nxt]))
            findings.append({"title": text, "body": " ".join(body.split())[:1500]})

    out = []
    for f in findings:
        strong, weak = keywords(f["title"])
        out.append({
            "title": redact(f["title"]),
            "strong": [redact(t) for t in strong],
            "weak": [redact(t) for t in weak],
        })
    return out


QUOTED = r"['\u2018\u2019\"\u201c\u201d]([^'\u2018\u2019\"\u201c\u201d]{3,60})['\u2018\u2019\"\u201c\u201d]"
# Runs of capitalised words, joined by real whitespace so that an all-caps
# acronym (ROAS) cannot split itself into two "words".
CAPNAME = (r"\b[A-Z][a-zA-Z0-9]*"
           r"(?:\s+(?:&|and|of|the|on|with|to)\s+[A-Z][a-zA-Z0-9]*"
           r"|\s+[A-Z][a-zA-Z0-9]*)+\b")
NUMERIC = r"(?:A?\$[\d,.]+\s*[km]?|\b\d+(?:\.\d+)?\s*ROAS|\b\d+(?:\.\d+)?%)"

# Imperative verbs that open a finding title -- "Give the Travel Mug Pro its
# own ad" is about the Travel Mug Pro, not about "give".
LEAD_VERBS = set("""give port replace advertise show make sell cull keep reconnect rebuild
fund build add test move run use drop start stop take put write cut fix launch push pull
send split merge kill retire refresh rework rename reorder the a an""".split())
# Tokens too common to identify anything on their own. Add words that are
# everywhere in your own domain with TRACE_GENERIC_WORDS="word1 word2".
GENERIC = set("""us uk au eu new all set old day days week""".split()) | set(
    os.environ.get("TRACE_GENERIC_WORDS", "").lower().split())


def _clean_capname(phrase):
    toks = phrase.split()
    while toks and toks[0].lower() in LEAD_VERBS:
        toks.pop(0)
    # only trim a trailing connector from a phrase long enough to survive it --
    # "Carry On" is a product name, "Travel Mug with" is not.
    while len(toks) > 2 and toks[-1].lower() in ("the", "a", "an", "and", "of", "with", "to", "on"):
        toks.pop()
    if not toks:
        return None
    if all(t.lower() in GENERIC or t.lower() in ("and", "of", "the") for t in toks):
        return None
    if len(toks) == 1 and (len(toks[0]) < 4 or toks[0].lower() in GENERIC):
        return None
    return " ".join(toks)


def keywords(title):
    """Split a finding title into distinctive terms and corroborating ones.

    strong = quoted product names, capitalised multiword names, money / ROAS /
    percentage figures. weak = the remaining rare words. A span counts as being
    about a finding only when a strong term lands, which is what stops
    generic words like "ads" or "spend" from matching half the run.
    """
    strong, weak = [], []

    def push(bucket, t):
        t = " ".join(t.split()).strip(" .,:;\u2019'\u201c\u201d\"()").lower()
        if len(t) < 3 or t in strong or t in weak:
            return
        bucket.append(t)

    for q in re.findall(QUOTED, title):
        push(strong, q)
    for cap in re.findall(CAPNAME, title):
        cleaned = _clean_capname(cap)
        if not cleaned:
            continue
        push(strong, cleaned)
        # "Travel Mug with LidLock" is two searchable names, and
        # neither half appears verbatim in a transcript as the whole phrase.
        for part in re.split(r"\s+(?:with|and|of|to|for)\s+", cleaned):
            sub = _clean_capname(part)
            if sub and sub != cleaned:
                push(strong, sub)
    for num in re.findall(NUMERIC, title):
        push(strong, num)
    for w in re.findall(r"[A-Za-z][A-Za-z0-9'\-]{3,}", title):
        if w.lower() in STOPWORDS:
            continue
        push(weak, w)
    return strong[:8], weak[:10]


# --------------------------------------------------------------------------
# HTML
# --------------------------------------------------------------------------

CSS = """
:root{--bg:#fbfbfa;--panel:#fff;--line:#e2e1dd;--fg:#22211f;--dim:#75736e;
 --sel:#e8eefc;--hit:#fff1a8;--acc:#3b62d6;
 --k-user:#2f7d4f;--k-text:#3b62d6;--k-think:#8a5bd6;--k-tool:#b4711d;
 --k-agent:#c0392b;--k-sys:#75736e;--k-comp:#0f8b8d;}
@media (prefers-color-scheme:dark){:root{--bg:#16171a;--panel:#1c1e22;--line:#2f323a;
 --fg:#e7e6e3;--dim:#9a9891;--sel:#23304d;--hit:#5c4c00;--acc:#7da2ff;
 --k-user:#63c48a;--k-text:#7da2ff;--k-think:#bb97f2;--k-tool:#e0a85a;
 --k-agent:#f0796a;--k-sys:#9a9891;--k-comp:#4fc9cb;}}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{background:var(--bg);color:var(--fg);font:13px/1.45 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;flex-direction:column}
code,pre,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
header{border-bottom:1px solid var(--line);background:var(--panel);padding:10px 14px;flex:0 0 auto}
h1{font-size:15px;margin:0 0 6px}
.meta{color:var(--dim);font-size:11.5px;margin-bottom:8px}
.stats{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end}
.stat{min-width:70px}
.stat b{display:block;font-size:16px;font-variant-numeric:tabular-nums;line-height:1.1}
.stat span{color:var(--dim);font-size:10.5px;text-transform:uppercase;letter-spacing:.04em}
.tools{display:flex;flex-wrap:wrap;gap:4px 6px;margin-top:7px;align-items:center}
.tools .tc{font-size:11px;border:1px solid var(--line);border-radius:10px;padding:0 7px;white-space:nowrap;
 font-family:ui-monospace,Menlo,monospace}
.tools .tc b{font-variant-numeric:tabular-nums;color:var(--dim);font-weight:600;margin-left:4px}
main{flex:1 1 auto;display:flex;min-height:0}
#left{flex:0 0 52%;border-right:1px solid var(--line);display:flex;flex-direction:column;min-width:320px}
#right{flex:1 1 auto;display:flex;flex-direction:column;min-width:280px}
.bar{padding:6px 10px;border-bottom:1px solid var(--line);background:var(--panel);display:flex;gap:8px;flex-wrap:wrap;align-items:center;font-size:11.5px}
.bar input[type=search]{flex:1 1 150px;min-width:110px;padding:3px 7px;border:1px solid var(--line);border-radius:4px;background:var(--bg);color:var(--fg)}
.bar button{padding:3px 8px;border:1px solid var(--line);border-radius:4px;background:var(--bg);color:var(--fg);cursor:pointer;font-size:11.5px}
.bar button:hover{border-color:var(--acc)}
.bar label{display:inline-flex;gap:3px;align-items:center;cursor:pointer;white-space:nowrap}
#tree{overflow:auto;flex:1 1 auto;padding:2px 0}
.row{display:flex;align-items:baseline;gap:6px;padding:1px 10px 1px 0;white-space:nowrap;cursor:pointer;
 content-visibility:auto;contain-intrinsic-size:0 19px;border-left:3px solid transparent}
.row:hover{background:var(--sel)}
.row.sel{background:var(--sel);border-left-color:var(--acc)}
.row.hit{background:var(--hit)}
.row.hide{display:none}
.ind{flex:0 0 auto;align-self:stretch;border-right:1px solid var(--line)}
.tw{width:12px;flex:0 0 12px;text-align:center;color:var(--dim);font-size:10px}
.tw.has{cursor:pointer}
.tm{flex:0 0 46px;text-align:right;color:var(--dim);font-size:10.5px;font-variant-numeric:tabular-nums;font-family:ui-monospace,Menlo,monospace}
.kd{flex:0 0 auto;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;padding:0 4px;border-radius:3px;border:1px solid currentColor;opacity:.85}
.nm{flex:0 0 auto;font-weight:600;font-family:ui-monospace,Menlo,monospace;font-size:11.5px}
.sm{flex:1 1 auto;overflow:hidden;text-overflow:ellipsis;color:var(--dim);font-size:11.5px}
.dr{flex:0 0 auto;color:var(--dim);font-size:10.5px;font-variant-numeric:tabular-nums}
.note-dot{flex:0 0 auto;color:var(--acc);font-size:11px}
.err{color:#d13b2f;font-weight:700}
.k-user .nm{color:var(--k-user)} .k-user .kd{color:var(--k-user)}
.k-text .nm{color:var(--k-text)} .k-text .kd{color:var(--k-text)}
.k-thinking .nm{color:var(--k-think)} .k-thinking .kd{color:var(--k-think)}
.k-tool .nm{color:var(--k-tool)} .k-tool .kd{color:var(--k-tool)}
.k-agent .nm{color:var(--k-agent)} .k-agent .kd{color:var(--k-agent)}
.k-system .nm{color:var(--k-sys)} .k-system .kd{color:var(--k-sys)}
.k-compaction .nm{color:var(--k-comp)} .k-compaction .kd{color:var(--k-comp)}
#detail{overflow:auto;flex:1 1 auto;padding:10px 14px}
#detail h2{font-size:13px;margin:0 0 4px}
#detail .dmeta{color:var(--dim);font-size:11.5px;margin-bottom:8px}
#detail .lbl{font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);margin:12px 0 3px}
pre.payload{background:var(--panel);border:1px solid var(--line);border-radius:5px;padding:8px 10px;
 white-space:pre-wrap;word-break:break-word;font-size:11.5px;max-height:none;margin:0}
.trunc{color:#b4711d;font-size:11px;margin-top:3px}
textarea#note{width:100%;min-height:80px;padding:6px 8px;border:1px solid var(--line);border-radius:5px;
 background:var(--panel);color:var(--fg);font:12px/1.4 inherit;resize:vertical}
#findings{border-top:1px solid var(--line);background:var(--panel);max-height:34%;overflow:auto;flex:0 0 auto}
#findings .fh{padding:5px 10px;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--dim);
 position:sticky;top:0;background:var(--panel);border-bottom:1px solid var(--line)}
.fitem{padding:3px 10px;cursor:pointer;font-size:12px;border-left:3px solid transparent;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fitem:hover{background:var(--sel)}
.fitem.on{background:var(--sel);border-left-color:var(--k-agent)}
.fitem .fc{color:var(--dim);font-size:10.5px;margin-left:5px}
mark{background:var(--hit);color:inherit;padding:0 1px;border-radius:2px}
.cstats{font-size:11px;color:var(--dim);margin-top:4px}
.empty{color:var(--dim);padding:20px 0}
"""

JS = r"""
const S = DATA.spans, F = DATA.findings, SESSION = DATA.sessionId, TITLE = DATA.title;
const NOTEKEY = 'session-trace-notes:' + SESSION;
let notes = {};
try { notes = JSON.parse(localStorage.getItem(NOTEKEY) || '{}'); } catch(e) { notes = {}; }

const tree = document.getElementById('tree');
const detail = document.getElementById('detail');
const search = document.getElementById('q');
const rows = [];
let sel = -1, matches = [], matchPos = -1, activeFinding = -1;
const collapsed = new Set();

function mmss(t){ if(t==null) return '  --'; const m=Math.floor(t/60), s=Math.floor(t%60);
  return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }
function dur(d){ if(d==null) return ''; return d<1 ? Math.round(d*1000)+'ms' : (d<60? d.toFixed(1)+'s' : Math.floor(d/60)+'m'+String(Math.round(d%60)).padStart(2,'0')); }
function kb(n){ if(n==null) return ''; return n<1024 ? n+'B' : (n/1024).toFixed(n<102400?1:0)+'KB'; }
// Everything that originates in a .jsonl record goes through esc() before it
// can reach innerHTML. Quotes are escaped too, so a value can never terminate
// an attribute even if one of these strings is ever moved into one.
function esc(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
// kind names drive class names as well as text, so keep them to a safe charset.
function kcls(k){ return String(k==null?'':k).replace(/[^a-z0-9_-]/gi,''); }

// ---- build rows -----------------------------------------------------------
const frag = document.createDocumentFragment();
S.forEach((sp,i)=>{
  const r = document.createElement('div');
  r.className = 'row k-'+kcls(sp.k);
  r.dataset.i = i;
  const hasKids = i+1 < S.length && S[i+1].d > sp.d;
  r.innerHTML =
    '<span class="tw'+(hasKids?' has':'')+'">'+(hasKids?'\u25be':'')+'</span>'+
    '<span class="tm">'+esc(mmss(sp.t))+'</span>'+
    (sp.d ? '<span class="ind" style="width:'+(Number(sp.d)*14)+'px"></span>' : '')+
    '<span class="kd">'+esc(sp.k)+'</span>'+
    '<span class="nm">'+esc(sp.n)+'</span>'+
    '<span class="sm"></span>'+
    '<span class="dr">'+(sp.err?'<span class="err">ERR</span> ':'')+esc(dur(sp.dur))+(sp.sz?' \u00b7 '+esc(kb(sp.sz)):'')+'</span>'+
    '<span class="note-dot"></span>';
  r.querySelector('.sm').textContent = sp.s || '';
  rows.push(r); frag.appendChild(r);
});
tree.appendChild(frag);
refreshDots();

tree.addEventListener('click', e=>{
  const r = e.target.closest('.row'); if(!r) return;
  const i = +r.dataset.i;
  if(e.target.classList.contains('has')){ toggle(i); return; }
  select(i);
});

function descendants(i){ const out=[]; const d=S[i].d;
  for(let j=i+1;j<S.length && S[j].d>d;j++) out.push(j); return out; }

function toggle(i){
  if(collapsed.has(i)) collapsed.delete(i); else collapsed.add(i);
  rows[i].querySelector('.tw').textContent = collapsed.has(i) ? '\u25b8' : '\u25be';
  applyVisibility();
}
function collapseAll(v){
  collapsed.clear();
  if(v) S.forEach((sp,i)=>{ if(i+1<S.length && S[i+1].d>sp.d) collapsed.add(i); });
  S.forEach((sp,i)=>{ const tw=rows[i].querySelector('.tw');
    if(tw.classList.contains('has')) tw.textContent = collapsed.has(i)?'\u25b8':'\u25be'; });
  applyVisibility();
}

function kindsOn(){ const s=new Set();
  document.querySelectorAll('.kf').forEach(c=>{ if(c.checked) s.add(c.value); }); return s; }

function applyVisibility(){
  const ks = kindsOn();
  const toolsOnly = document.getElementById('toolsonly').checked;
  const q = search.value.trim().toLowerCase();
  matches = [];
  let hideUnder = -1, hideDepth = 0;
  for(let i=0;i<S.length;i++){
    const sp = S[i];
    let hidden = false;
    if(hideUnder >= 0){ if(sp.d > hideDepth) hidden = true; else hideUnder = -1; }
    if(!hidden){
      if(!ks.has(sp.k)) hidden = true;
      if(toolsOnly && sp.k!=='tool' && sp.k!=='agent') hidden = true;
      if(q){
        const hay = ((sp.s||'')+' '+(sp.inp||'')+' '+(sp.out||'')+' '+sp.n).toLowerCase();
        if(hay.indexOf(q) < 0) hidden = true; else matches.push(i);
      }
    }
    rows[i].classList.toggle('hide', hidden);
    if(!hidden && collapsed.has(i)){ hideUnder = i; hideDepth = sp.d; }
  }
  document.getElementById('mcount').textContent =
    q ? (matches.length + ' match' + (matches.length===1?'':'es')) : (S.length + ' spans');
  matchPos = -1;
}

function refreshDots(){
  S.forEach((sp,i)=>{ rows[i].querySelector('.note-dot').textContent = notes[sp.sid] ? '\u270e' : ''; });
}

// ---- detail ---------------------------------------------------------------
function select(i){
  if(sel>=0 && rows[sel]) rows[sel].classList.remove('sel');
  sel = i; rows[i].classList.add('sel');
  const sp = S[i];
  const bits = [];
  bits.push('<h2>'+esc(sp.n)+' <span style="color:var(--dim);font-weight:400">'+esc(sp.k)+'</span></h2>');
  const m = [];
  m.push(esc(mmss(sp.t))+' into run');
  if(sp.ts) m.push(esc(sp.ts));
  if(sp.dur!=null) m.push('took '+esc(dur(sp.dur)));
  if(sp.sz) m.push('result '+esc(kb(sp.sz)));
  if(sp.err) m.push('<span class="err">ERROR</span>');
  if(sp.a) m.push('agent: '+esc(sp.a));
  if(sp.child) m.push('child: '+esc(sp.child)+(sp.childHow?' (via '+esc(sp.childHow)+')':''));
  bits.push('<div class="dmeta">'+m.join(' \u00b7 ')+'</div>');
  if(sp.cstats){
    const c = sp.cstats;
    // every one of these is transcript-derived: the counts come from the child
    // record and t[0] is a tool name straight out of the .jsonl.
    const num = v => Number(v||0).toLocaleString();
    bits.push('<div class="cstats">child run: '+num(c.turns)+' model turns, '+num(c.tools)+
      ' tool calls, '+num(c.errors)+' errors, tokens '+num(c.in)+' in / '+num(c.out)+' out / '+
      num(c.cache_read)+' cache-read \u00b7 '+
      (c.top||[]).map(t=>esc(t[0])+'\u00d7'+num(t[1])).join(', ')+'</div>');
  }
  if(sp.inp){
    bits.push('<div class="lbl">Input</div><pre class="payload">'+hl(sp.inp)+'</pre>');
    if(sp.inOm) bits.push('<div class="trunc">truncated, '+Number(sp.inOm)+' KB omitted</div>');
  }
  if(sp.out){
    bits.push('<div class="lbl">'+(sp.k==='tool'||sp.k==='agent'?'Output':'Content')+'</div><pre class="payload">'+hl(sp.out)+'</pre>');
    if(sp.outOm) bits.push('<div class="trunc">truncated, '+Number(sp.outOm)+' KB omitted</div>');
  }
  bits.push('<div class="lbl">Note</div><textarea id="note" placeholder="notes for this span, saved in this browser"></textarea>');
  detail.innerHTML = bits.join('');
  detail.scrollTop = 0;
  const ta = document.getElementById('note');
  ta.value = notes[sp.sid] || '';
  ta.addEventListener('input', ()=>{
    const v = ta.value;
    if(v.trim()) notes[sp.sid] = v; else delete notes[sp.sid];
    try{ localStorage.setItem(NOTEKEY, JSON.stringify(notes)); }catch(e){}
    rows[i].querySelector('.note-dot').textContent = notes[sp.sid] ? '\u270e' : '';
  });
}

function rx(s){ return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function hl(text){
  // one combined pass, so a later term can never match inside a <mark> emitted
  // by an earlier one.
  const terms = [];
  const q = search.value.trim();
  if(q) terms.push(q);
  if(activeFinding>=0 && F[activeFinding])
    F[activeFinding].strong.concat(F[activeFinding].weak).forEach(t=>terms.push(t));
  const out = esc(text);
  if(!terms.length) return out;
  terms.sort((a,b)=>b.length-a.length);
  try{
    const re = new RegExp('(' + terms.map(rx).join('|') + ')','gi');
    return out.replace(re, m=>'<mark>'+m+'</mark>');
  }catch(e){ return out; }
}

// ---- findings -------------------------------------------------------------
function findingHits(f){
  const hits = [];
  if(!f.strong.length && !f.weak.length) return hits;
  for(let i=0;i<S.length;i++){
    const sp = S[i];
    const hay = ((sp.s||'')+' '+(sp.inp||'')+' '+(sp.out||'')).toLowerCase();
    if(!hay) continue;
    let st = 0, wk = 0;
    for(const t of f.strong){ if(hay.indexOf(t) >= 0) st++; }
    for(const t of f.weak){ if(hay.indexOf(t) >= 0) wk++; }
    // a distinctive name has to land, plus one corroborating word; with no
    // distinctive name at all, fall back to three corroborating words.
    const hit = f.strong.length ? (st >= 1 && st + wk >= 2) : (wk >= 3);
    if(hit) hits.push(i);
  }
  return hits;
}
function pickFinding(k){
  const items = document.querySelectorAll('.fitem');
  rows.forEach(r=>r.classList.remove('hit'));
  if(activeFinding === k){ activeFinding = -1; items.forEach(x=>x.classList.remove('on'));
    document.getElementById('mcount').textContent = S.length+' spans'; return; }
  activeFinding = k;
  items.forEach((x,j)=>x.classList.toggle('on', j===k));
  const hits = F[k].hits;
  hits.forEach(i=>rows[i].classList.add('hit'));
  document.getElementById('mcount').textContent = hits.length+' spans mention this';
  if(hits.length){
    // expand ancestors of the first hit, then scroll to it
    expandTo(hits[0]);
    applyVisibility();
    hits.forEach(i=>rows[i].classList.add('hit'));
    rows[hits[0]].scrollIntoView({block:'center'});
    select(hits[0]);
  }
}
function expandTo(i){
  let d = S[i].d;
  for(let j=i-1;j>=0 && d>0;j--){ if(S[j].d < d){ collapsed.delete(j); d = S[j].d;
    const tw = rows[j].querySelector('.tw'); if(tw.classList.contains('has')) tw.textContent='\u25be'; } }
}

// ---- controls -------------------------------------------------------------
search.addEventListener('input', ()=>{ applyVisibility(); if(sel>=0) select(sel); });
document.querySelectorAll('.kf').forEach(c=>c.addEventListener('change', applyVisibility));
document.getElementById('toolsonly').addEventListener('change', applyVisibility);
document.getElementById('expand').onclick = ()=>collapseAll(false);
document.getElementById('collapse').onclick = ()=>collapseAll(true);
function jump(step){
  if(!matches.length) return;
  matchPos = (matchPos + step + matches.length) % matches.length;
  const i = matches[matchPos];
  rows[i].scrollIntoView({block:'center'}); select(i);
}
document.getElementById('next').onclick = ()=>jump(1);
document.getElementById('prev').onclick = ()=>jump(-1);

document.getElementById('export').onclick = ()=>{
  const out = [];
  S.forEach(sp=>{ if(notes[sp.sid]) out.push({sessionId:SESSION, spanId:sp.sid,
    time:sp.ts||null, rel:mmss(sp.t), kind:sp.k, name:sp.n, summary:sp.s, note:notes[sp.sid]}); });
  const blob = new Blob([JSON.stringify(out,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = TITLE.replace(/[^A-Za-z0-9._-]+/g,'-') + '-notes.json';
  a.click(); URL.revokeObjectURL(a.href);
};
document.getElementById('import').addEventListener('change', e=>{
  const f = e.target.files[0]; if(!f) return;
  const rd = new FileReader();
  rd.onload = ()=>{ try{
    const arr = JSON.parse(rd.result);
    (Array.isArray(arr)?arr:[]).forEach(o=>{ if(o && o.spanId && o.note) notes[o.spanId]=o.note; });
    localStorage.setItem(NOTEKEY, JSON.stringify(notes));
    refreshDots(); if(sel>=0) select(sel);
  }catch(err){ alert('could not read notes file: '+err); } };
  rd.readAsText(f);
});

// findings list
if(F.length){
  F.forEach(f=>{ f.hits = findingHits(f); });
  const box = document.getElementById('flist');
  F.forEach((f,k)=>{
    const d = document.createElement('div');
    d.className = 'fitem';
    // built node by node so the report-derived title never touches innerHTML.
    const nameEl = document.createElement('span');
    nameEl.textContent = f.title;
    const cntEl = document.createElement('span');
    cntEl.className = 'fc';
    cntEl.textContent = String(f.hits.length);
    d.appendChild(nameEl); d.appendChild(cntEl);
    d.onclick = ()=>pickFinding(k);
    box.appendChild(d);
  });
}

applyVisibility();
if(S.length) select(0);
"""


def build_html(title, root_meta, spans, findings, header_stats, linkage):
    kinds = sorted({s["k"] for s in spans})
    kind_boxes = "".join(
        '<label><input type="checkbox" class="kf" value="%s" checked>%s</label>' % (k, k)
        for k in kinds)

    hs = header_stats
    tool_rows = "".join(
        '<span class="tc">%s<b>%d</b></span>' % (html.escape(n), c)
        for n, c in hs["tools"].most_common(24))
    stat = lambda v, l: '<div class="stat"><b>%s</b><span>%s</span></div>' % (v, l)
    stats_html = "".join([
        stat(hs["wall"], "wall time"),
        stat("{:,}".format(hs["turns"]), "model turns"),
        stat("{:,}".format(sum(hs["tools"].values())), "tool calls"),
        stat(str(hs["subagents"]), "subagents"),
        stat("{:,}".format(hs["in"]), "tokens in"),
        stat("{:,}".format(hs["out"]), "tokens out"),
        stat("{:,}".format(hs["cache_read"]), "cache read"),
        stat("{:,}".format(hs["cache_write"]), "cache write"),
        stat(str(hs["errors"]), "tool errors"),
    ])

    findings_html = ""
    if findings:
        findings_html = (
            '<div id="findings"><div class="fh">Findings from the report '
            '&mdash; click one to highlight the spans behind it</div>'
            '<div id="flist"></div></div>')

    data = {
        "spans": spans,
        "findings": findings,
        "sessionId": root_meta["sessionId"],
        "title": title,
    }
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    # Escape every <, > and & as JSON unicode escapes so no tag can form inside
    # the data script block, whatever the case or shape (JSON.parse accepts them).
    payload = payload.replace("&", "\\u0026").replace("<", "\\u003c").replace(">", "\\u003e")

    meta_line = "session %s &middot; %s &rarr; %s &middot; root %s" % (
        html.escape(root_meta["sessionId"] or "?"),
        html.escape(fmt_clock(hs["first"])), html.escape(fmt_clock(hs["last"])),
        html.escape(root_meta["rootLabel"]))
    if linkage:
        meta_line += " &middot; child links: " + html.escape(
            ", ".join("%s\u00d7%d" % (k, v) for k, v in linkage.most_common()))

    return """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>%(title)s</title>
<style>%(css)s</style></head>
<body>
<header>
  <h1>%(title)s</h1>
  <div class="meta">%(meta)s</div>
  <div class="stats">%(stats)s</div>
  <div class="tools">%(tools)s</div>
</header>
<main>
  <div id="left">
    <div class="bar">
      <input type="search" id="q" placeholder="search spans, inputs, outputs">
      <button id="prev">&uarr;</button><button id="next">&darr;</button>
      <span id="mcount" style="color:var(--dim)"></span>
      <button id="collapse">collapse all</button><button id="expand">expand all</button>
      <label><input type="checkbox" id="toolsonly">tool calls only</label>
      %(kinds)s
      <button id="export">Export notes</button>
      <label>Import notes<input type="file" id="import" accept="application/json" style="display:none"></label>
    </div>
    <div id="tree"></div>
    %(findings)s
  </div>
  <div id="right"><div id="detail" class="empty">select a span</div></div>
</main>
<script id="tracedata" type="application/json">%(payload)s</script>
<script>const DATA = JSON.parse(document.getElementById('tracedata').textContent);
%(js)s</script>
</body></html>
""" % {
        "title": html.escape(title),
        "css": CSS,
        "meta": meta_line,
        "stats": stats_html,
        "tools": tool_rows,
        "kinds": kind_boxes,
        "findings": findings_html,
        "payload": payload,
        "js": JS,
    }


# --------------------------------------------------------------------------

def fmt_wall(a, b):
    ea, eb = parse_ts(a), parse_ts(b)
    if not ea or not eb:
        return "?"
    d = int(eb - ea)
    h, rem = divmod(d, 3600)
    m, s = divmod(rem, 60)
    return ("%dh %02dm" % (h, m)) if h else ("%dm %02ds" % (m, s))


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", help="session .jsonl or subagents/agent-*.jsonl")
    ap.add_argument("--out", required=True, help="output html path")
    ap.add_argument("--title", default=None)
    ap.add_argument("--report", default=None, help="report html to mine for findings")
    ap.add_argument("--findings-section", default=r"suggestion|recommendation|finding",
                    help="regex matched against <h2> text; the <h3>s under a matching "
                         "<h2> become findings")
    args = ap.parse_args()

    root = os.path.abspath(os.path.expanduser(args.root))
    if not os.path.exists(root):
        sys.exit("no such transcript: " + root)

    subdir = subagent_dir_for(root)
    index = load_agent_index(subdir)

    base = os.path.basename(root)[:-6]
    root_label = base[len("agent-"):] if base.startswith("agent-") else base
    title = args.title or ("Trace: " + root_label)

    b = Builder(index)
    stats = b.walk(root, 0, root_label)
    if not stats:
        sys.exit("transcript produced no spans: " + root)

    spans = b.spans
    session_id = None
    for r in load_jsonl(root)[:50]:
        session_id = r.get("sessionId")
        if session_id:
            break

    header = summarize(stats)
    header["tools"] = stats["tools"]
    header["first"] = stats["first"]
    header["last"] = stats["last"]
    header["wall"] = fmt_wall(stats["first"], stats["last"])
    header["subagents"] = sum(1 for s in spans if s.get("k") == "agent" and s.get("cstats"))
    header["errors"] = sum(1 for s in spans if s.get("err"))

    findings = parse_findings(args.report, args.findings_section) if args.report else []

    htmlout = build_html(title,
                         {"sessionId": session_id or root_label, "rootLabel": root_label},
                         spans, findings, header, b.linkage)

    outp = os.path.abspath(os.path.expanduser(args.out))
    os.makedirs(os.path.dirname(outp), exist_ok=True)
    with open(outp, "w", encoding="utf-8") as fh:
        fh.write(htmlout)

    sys.stderr.write(
        "wrote %s (%.1f MB)\n  spans=%d  subagents=%d  tools=%d  turns=%d  wall=%s\n"
        "  linkage=%s\n  redactions=%s\n"
        % (outp, os.path.getsize(outp) / 1048576.0, len(spans),
           header["subagents"], sum(header["tools"].values()), header["turns"],
           header["wall"], dict(b.linkage), dict(REDACTION_STATS)))


if __name__ == "__main__":
    main()
