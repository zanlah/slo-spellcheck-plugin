# Usage: python3 -I solar_extract.py <Solar.TEI.zip> <out.jsonl>
# One JSON line per original sentence of error-annotated documents:
#   {"sid", "doc", "orig": [[text, space_after, error_types|None]], "corr": [[text, space_after]]}
import sys, zipfile, json, collections
import xml.etree.ElementTree as ET
TEI = '{http://www.tei-c.org/ns/1.0}'; XID = '{http://www.w3.org/XML/1998/namespace}id'
zp, outp = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(zp)

def sentences(name):
    """yield (doc_id, errs_annotated, sentence_id, [(tok_id, text, space_after)])"""
    doc = None; errs = False; sent = None
    with z.open(name) as fh:
        for ev, el in ET.iterparse(fh, events=('start', 'end')):
            tag = el.tag.replace(TEI, '')
            if ev == 'start':
                if tag == 'div': doc = el.get(XID); errs = False
                elif tag == 's': sent = (el.get(XID), [])
                continue
            if tag == 'note' and el.get('type') == 'errs': errs = (el.text or '').strip() == 'DA'
            elif tag in ('w', 'pc') and sent is not None:
                sent[1].append((el.get(XID), el.text or '', el.get('join') != 'right'))
            elif tag == 's':
                yield doc, errs, sent[0], sent[1]; sent = None; el.clear()
            elif tag in ('p', 'div'): el.clear()

# token id (orig) -> error types ; orig sentence -> corr sentences
tok_err = collections.defaultdict(list); s2c = collections.defaultdict(list)
with z.open('Solar.TEI/solar-errs.xml') as fh:
    for ev, el in ET.iterparse(fh, events=('end',)):
        tag = el.tag.replace(TEI, '')
        if tag == 'linkGrp':
            ids = (el.get('corresp') or '').split()
            o = [i[1:] for i in ids if 's.' in i.split('.')[0] + '.']
            for i in ids:
                if i.startswith('#') and i[1:].split('.')[0].endswith('s'):
                    for j in ids:
                        if j[1:].split('.')[0].endswith('t'): s2c[i[1:]].append(j[1:])
            for link in el:
                t = link.get('type')
                if t == 'ID': continue
                for tg in link.get('target', '').split():
                    if tg[1:].split('.')[0].endswith('s'): tok_err[tg[1:]].append(t)
            el.clear()
print('error links on orig tokens:', len(tok_err), file=sys.stderr)

corr = {}
for doc, errs, sid, toks in sentences('Solar.TEI/solar-corr.xml'):
    corr[sid] = [[t, sp] for _, t, sp in toks]
print('corr sentences:', len(corr), file=sys.stderr)

n = 0
with open(outp, 'w', encoding='utf-8') as out:
    for doc, errs, sid, toks in sentences('Solar.TEI/solar-orig.xml'):
        if not errs: continue
        cs = []
        for c in s2c.get(sid, []):
            if c in corr: cs.extend(corr[c]) 
        out.write(json.dumps({'sid': sid, 'doc': doc, 'orig': [[t, sp, tok_err.get(i)] for i, t, sp in toks], 'corr': cs}, ensure_ascii=False) + '\n'); n += 1
print('annotated orig sentences:', n, file=sys.stderr)
