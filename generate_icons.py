"""Generate simple cookie-colored PNG icons for the Chrome extension."""
import struct, zlib, os, math

def make_png(size, filename):
    rows = []
    cx = cy = size / 2
    outer_r = size / 2 - 1
    inner_r = outer_r * 0.85

    for y in range(size):
        row = bytearray(b'\x00')  # filter byte: None
        for x in range(size):
            dx = x - cx + 0.5
            dy = y - cy + 0.5
            d  = math.sqrt(dx*dx + dy*dy)

            if d <= outer_r:
                # Chocolate chip dots
                chip = False
                for (cx2, cy2) in [(0.35, 0.30), (0.65, 0.45), (0.30, 0.65), (0.60, 0.70)]:
                    cdx = x - cx2 * size
                    cdy = y - cy2 * size
                    if cdx*cdx + cdy*cdy < (size * 0.07) ** 2:
                        chip = True
                        break

                if chip:
                    row += bytes([60, 30, 10, 255])   # dark brown chip
                elif d > inner_r:
                    row += bytes([160, 95, 35, 255])   # darker edge
                else:
                    row += bytes([205, 133, 63, 255])  # cookie tan
            else:
                row += bytes([0, 0, 0, 0])             # transparent

        rows.append(bytes(row))

    raw = b''.join(rows)
    compressed = zlib.compress(raw, 9)

    def chunk(name, data):
        crc = zlib.crc32(name + data) & 0xFFFFFFFF
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', crc)

    sig  = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    idat = chunk(b'IDAT', compressed)
    iend = chunk(b'IEND', b'')

    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename, 'wb') as f:
        f.write(sig + ihdr + idat + iend)
    print(f'Created {filename}')

base = os.path.dirname(os.path.abspath(__file__))
for size in [16, 48, 128]:
    make_png(size, os.path.join(base, 'icons', f'icon{size}.png'))
print('All icons generated!')
