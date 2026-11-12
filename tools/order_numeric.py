# 數字／時間類選項照大小排好（真實考試也是這樣排）
import json, re, sys
W = {w: i for i, w in enumerate("zero one two three four five six seven eight nine ten eleven twelve fifteen twenty thirty".split())}
W.update({"fifteen": 15, "twenty": 20, "thirty": 30, "eleven": 11, "twelve": 12})
def key(s):
    t = s.lower().replace(',', '')
    m = re.match(r'\$?(\d+(?:\.\d+)?)(?::(\d+))?\s*(a\.m\.|p\.m\.)?', t)
    if m:
        v = float(m.group(1)) + (float(m.group(2)) / 60 if m.group(2) else 0)
        if m.group(3) == 'p.m.' and v < 12: v += 12
        return v
    f = t.split()[0] if t.split() else ''
    return W.get(f)
p = sys.argv[1]; d = json.load(open(p)); n = 0
for v in d['parts'].values():
    for x in v:
        for q in x.get('qs', [x]):
            ks = [key(o) for o in q['o']]
            if all(k is not None for k in ks):
                ans = q['o'][q['a']]; q['o'] = sorted(q['o'], key=key); q['a'] = q['o'].index(ans); n += 1
json.dump(d, open(p, 'w'), ensure_ascii=False, separators=(',', ':'))
print(p, 'sorted', n)
