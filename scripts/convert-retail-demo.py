#!/usr/bin/env python3
"""Convert a checked-out FORMA HOME designer site into a retail-only demo.
Never edits the original source repository.
"""
from pathlib import Path
import json
import re

root = Path(__file__).resolve().parents[1]

def edit(name, replacements):
    path = root / name
    contents = path.read_text(encoding='utf-8')
    for before, after in replacements:
        found = contents.count(before)
        if found != 1:
            raise RuntimeError(f'{name}: expected one match, found {found}: {before[:90]}')
        contents = contents.replace(before, after, 1)
    path.write_text(contents, encoding='utf-8')
    print('Updated', name)

edit('index.html', [
    ('FORMA HOME — профессиональные цены для дизайнеров интерьера, мебель и предметы интерьера.',
     'FORMA HOME — мебель и предметы интерьера.'),
    ('<title>FORMA HOME — профессиональные цены для дизайнеров</title>',
     '<title>FORMA HOME — каталог мебели и предметов интерьера</title>'),
    ('Специальные цены для дизайнеров относительно розничных',
     'Мебель и предметы интерьера FORMA HOME'),
    ('Специальные цены и бонус 20% для дизайнеров и комплектаторов',
     'Мебель и предметы интерьера для вашего дома'),
])

edit('app.js', [
    ('minPrice=p=>Math.min(...p.variants.map(v=>Number(v.wholesalePrice)||Infinity))',
     'minPrice=p=>Math.min(...p.variants.map(v=>Number(v.retailPrice)||Infinity))'),
    ('function orderText(rows=cartRows(),total=rows.reduce((s,x)=>s+x.variant.wholesalePrice*x.qty,0))',
     'function orderText(rows=cartRows(),total=rows.reduce((s,x)=>s+x.variant.retailPrice*x.qty,0))'),
    ('${money(v.wholesalePrice*qty)}', '${money(v.retailPrice*qty)}'),
    ('const total=rows.reduce((s,x)=>s+x.variant.wholesalePrice*x.qty,0)',
     'const total=rows.reduce((s,x)=>s+x.variant.retailPrice*x.qty,0)'),
    (',retail=Number(v.retailPrice)>Number(v.wholesalePrice)', ''),
    ("${Number(v.retailPrice)>0?money(v.wholesalePrice):'Цена уточняется'}",
     "${Number(v.retailPrice)>0?money(v.retailPrice):'Цена уточняется'}"),
    ("${retail?`<del>${money(v.retailPrice)}</del>`:''}", ''),
])

vfile = root / 'variants.js'
v = vfile.read_text(encoding='utf-8')
pattern = r'function priceTemplate\(variant,detail=false\)\{.*?\n\}'
match = re.search(pattern, v, flags=re.DOTALL)
if not match or len(re.findall(pattern, v, flags=re.DOTALL)) != 1:
    raise RuntimeError('variants.js: missing or ambiguous priceTemplate')
old = match.group(0)
new = re.sub(r'^  const retail=.*\n', '', old, flags=re.MULTILINE)
new = re.sub(r'^  const offer=.*\n', '', new, flags=re.MULTILINE)
new = new.replace('Цена для дизайнера', 'Розничная цена')
new = new.replace(' ${offer}', '')
new = new.replace('${retail}', '')
new = new.replace('${money(variant.wholesalePrice)}', '${money(variant.retailPrice)}')
if new == old or any(x in new for x in ('designer-discount', '<del>', 'Цена для дизайнера', '${offer}', '${retail}')):
    raise RuntimeError('variants.js: price template still contains discount elements')
vfile.write_text(v.replace(old, new, 1), encoding='utf-8')
print('Updated variants.js')

edit('media-policy.js', [
    ('raw.githubusercontent.com/gkkm8bm7rn-eng/forma-designer-private/main/data/details/',
     'raw.githubusercontent.com/gkkm8bm7rn-eng/Demo/main/data/details/'),
])

catalog = json.loads((root / 'data/catalog-index.json').read_text(encoding='utf-8'))
products = catalog['products']
variants = [v for product in products for v in product['variants']]
assert len(products) >= 500 and len(variants) >= 1000, 'Unexpectedly incomplete source catalog'
assert all('retailPrice' in v for v in variants), 'Missing retail price field'
assert (root / 'assets/products').exists(), 'Missing product photos folder'
photo_count = len(list((root / 'assets/products').rglob('*.webp')))
assert photo_count >= 7000, f'Only {photo_count} photos were copied'
assert len(list((root / 'data/details').glob('*.json'))) >= 20
assert 'Цена для дизайнера' not in (root / 'variants.js').read_text(encoding='utf-8')
assert 'Специальные цены' not in (root / 'index.html').read_text(encoding='utf-8')
print(f'Valid: {len(products)} models, {len(variants)} variants, {photo_count} WebP files')
