import requests
from bs4 import BeautifulSoup
import json
import re
import time
import sys

BASE_URL = "https://decentralization.ua"

def fetch(url):
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return BeautifulSoup(resp.text, 'html.parser')

def extract_info_blocks(soup):
    data = {}
    for block in soup.select('.single-page-information .info-block'):
        text = block.get_text('\n', strip=True)
        lines = [l.strip() for l in text.split('\n') if l.strip()]
        for i, line in enumerate(lines):
            if line.startswith('КАТОТТГ'):
                data['katotth'] = lines[i+1] if i+1 < len(lines) else ''
            elif line.startswith('Площа'):
                data['area'] = lines[i+1] if i+1 < len(lines) else ''
            elif line.startswith('Чисельність населен') or 'Кількість населен' in line:
                val = lines[i+1] if i+1 < len(lines) else ''
                if 'Кількість населених пунктів' in line:
                    data['settlements_count'] = val
                elif 'Кількість територіальних громад' in line:
                    data['hromadas_count'] = val
                elif 'Чисельність населен' in line or 'Кількість населення' in line:
                    data['population'] = val
            elif line.startswith('Тип громади'):
                data['type'] = lines[i+1] if i+1 < len(lines) else ''
    return data

def extract_title(soup):
    title_el = soup.select_one('.single-page-title')
    return title_el.get_text(strip=True) if title_el else ''

def scrape_oblast(oblast_id):
    url = f"{BASE_URL}/areas/{oblast_id}"
    print(f"OBLAST: {url}", file=sys.stderr)
    soup = fetch(url)
    oblast = {
        'id': oblast_id,
        'name': extract_title(soup),
        'url': url,
    }
    oblast.update(extract_info_blocks(soup))
    oblast['raions'] = []
    for table in soup.select('.new-table-block .community-table'):
        link = table.select_one('a[href*="/newrayons/"]')
        if link:
            href = link['href']
            raion_id = href.split('/')[-1]
            raion_name = link.get_text(strip=True)
            oblast['raions'].append({
                'id': raion_id,
                'name': raion_name,
                'url': BASE_URL + href,
            })
    return oblast

def scrape_raion(raion_id):
    url = f"{BASE_URL}/newrayons/{raion_id}"
    print(f"  RAION: {url}", file=sys.stderr)
    soup = fetch(url)
    raion = {
        'id': raion_id,
        'name': extract_title(soup),
        'url': url,
    }
    raion.update(extract_info_blocks(soup))
    raion['hromadas'] = parse_hromada_list(soup)
    # Handle pagination
    current_page = 1
    while True:
        paginator = soup.select_one('.paginator-block')
        if not paginator:
            break
        next_link = paginator.select_one('.next a')
        if not next_link or not next_link.get('href') or next_link['href'] == '#':
            break
        current_page += 1
        next_url = BASE_URL + next_link['href']
        print(f"    Raion page {current_page}: {next_url}", file=sys.stderr)
        soup = fetch(next_url)
        raion['hromadas'].extend(parse_hromada_list(soup))
    return raion

def parse_hromada_list(soup):
    hromadas = []
    for table in soup.select('.new-table-block .community-table'):
        link = table.select_one('a[href*="/newgromada/"]')
        if link:
            href = link['href']
            hromada_id = href.split('/')[-1]
            hromada_name = link.get_text(strip=True)
            hromadas.append({
                'id': hromada_id,
                'name': hromada_name,
                'url': BASE_URL + href,
            })
    return hromadas

def scrape_hromada(hromada_id):
    url = f"{BASE_URL}/newgromada/{hromada_id}"
    print(f"    HROMADA: {url}", file=sys.stderr)
    soup = fetch(url)
    hromada = {
        'id': hromada_id,
        'name': extract_title(soup),
        'url': url,
    }
    hromada.update(extract_info_blocks(soup))
    hromada['settlements'] = []
    # Parse first page
    hromada['settlements'] = parse_settlements(soup)
    # Handle pagination
    current_page = 1
    while True:
        paginator = soup.select_one('.paginator-block')
        if not paginator:
            break
        next_link = paginator.select_one('.next a')
        if not next_link or not next_link.get('href') or next_link['href'] == '#':
            break
        current_page += 1
        next_url = BASE_URL + next_link['href']
        print(f"      Page {current_page}: {next_url}", file=sys.stderr)
        soup = fetch(next_url)
        hromada['settlements'].extend(parse_settlements(soup))
    return hromada

def parse_settlements(soup):
    settlements = []
    for row in soup.select('.new-composition-table .new-composition-row'):
        link = row.select_one('a.name')
        if link:
            href = link['href']
            locality_id = href.split('/')[-1]
            full_name = link.get_text(strip=True)
            katotth_el = row.select_one('.value')
            katotth = katotth_el.get_text(strip=True) if katotth_el else ''
            # Parse type from name (e.g., "селище Єзупіль - адміністративний центр")
            name_clean = full_name
            settlement_type = ''
            for t in ['місто', 'селище', 'село']:
                if full_name.startswith(t):
                    settlement_type = t
                    name_clean = full_name[len(t):].strip().lstrip('-').strip()
                    break
            # Remove " - адміністративний центр"
            if ' - ' in name_clean:
                name_clean = name_clean.split(' - ')[0].strip()
            settlements.append({
                'id': locality_id,
                'name': name_clean,
                'type': settlement_type,
                'katotth': katotth,
                'url': BASE_URL + href,
            })
    return settlements

def main(oblast_id):
    oblast = scrape_oblast(oblast_id)
    for ri, raion_info in enumerate(oblast['raions'], 1):
        print(f"[{ri}/{len(oblast['raions'])}] {raion_info['name']}", file=sys.stderr)
        raion = scrape_raion(raion_info['id'])
        raion_info.update(raion)
        for hi, hromada_info in enumerate(raion['hromadas'], 1):
            print(f"  [{hi}/{len(raion['hromadas'])}] {hromada_info['name']}", file=sys.stderr)
            hromada = scrape_hromada(hromada_info['id'])
            hromada_info.update(hromada)
            time.sleep(0.2)
        time.sleep(0.2)
    return oblast

def clean_output(result):
    oblast_out = {
        'id': result['id'],
        'name': result['name'],
        'url': result['url'],
        'katotth': result.get('katotth', ''),
        'type': 'область',
        'raions': []
    }
    for r in result['raions']:
        raion_out = {
            'id': r['id'],
            'name': r['name'],
            'url': r['url'],
            'katotth': r.get('katotth', ''),
            'type': 'район',
            'hromadas': []
        }
        for h in r.get('hromadas', []):
            hromada_out = {
                'id': h['id'],
                'name': h['name'],
                'url': h['url'],
                'katotth': h.get('katotth', ''),
                'type': h.get('type', ''),
                'settlements': []
            }
            for s in h.get('settlements', []):
                settlement_out = {
                    'id': s['id'],
                    'name': s['name'],
                    'type': s.get('type', ''),
                    'url': s['url'],
                    'katotth': s.get('katotth', ''),
                }
                hromada_out['settlements'].append(settlement_out)
            raion_out['hromadas'].append(hromada_out)
        oblast_out['raions'].append(raion_out)
    return [oblast_out]

if __name__ == '__main__':
    oblast_id = sys.argv[1] if len(sys.argv) > 1 else '0342'
    result = main(oblast_id)
    output = clean_output(result)
    with open('if_oblast_data.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    oblast = output[0]
    print(f"\nDone! Saved to if_oblast_data.json", file=sys.stderr)
    print(f"Oblasts: {len(output)}", file=sys.stderr)
    print(f"Raions: {len(oblast['raions'])}", file=sys.stderr)
    print(f"Hromadas: {sum(len(r['hromadas']) for r in oblast['raions'])}", file=sys.stderr)
    print(f"Settlements: {sum(len(h['settlements']) for r in oblast['raions'] for h in r['hromadas'])}", file=sys.stderr)
