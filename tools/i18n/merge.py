"""Fusionne les traductions des lots (tmp/tr/out-*.json) dans src/i18n/en.json en vérifiant les marqueurs {…}."""
import json,glob,re,sys
p='src/i18n/en.json'
d=json.load(open(p))
ph=lambda s: sorted(re.findall(r'\{[A-Za-z0-9_]+\}',s))
bad=0;n=0
for i in range(15,40):
    try: inp=json.load(open(f'tmp/tr/in-{i:02d}.json')); out=json.load(open(f'tmp/tr/out-{i:02d}.json'))
    except FileNotFoundError: continue
    for e in inp:
        fr=e['fr']; t=out.get(fr)
        if t is None or ph(fr)!=ph(t): bad+=1; print('KO',fr,t); continue
        d[fr]=t; n+=1
extra={'Rapporte surtout : {0}.':'Best for: {0}.','Rapporte surtout : {0}':'Best for: {0}'}
d.update(extra)
json.dump(d,open(p,'w'),ensure_ascii=False,indent=0,sort_keys=True)
print(n,bad,len(d))
