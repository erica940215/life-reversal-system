# 把模擬試題每題的選項打亂（固定亂數種子），避免正解都在同一個位置
import json, random, sys, collections
p = sys.argv[1]; d = json.load(open(p)); rnd = random.Random(p)
cnt = collections.Counter()
def sh(q):
    o = q['o']; ans = o[q['a']]; idx = list(range(len(o))); rnd.shuffle(idx)
    q['o'] = [o[i] for i in idx]; q['a'] = q['o'].index(ans); cnt[q['a']] += 1
for k, v in d['parts'].items():
    for x in v:
        for q in x.get('qs', [x]): sh(q)
json.dump(d, open(p, 'w'), ensure_ascii=False, separators=(',', ':'))
print(p, dict(cnt))
