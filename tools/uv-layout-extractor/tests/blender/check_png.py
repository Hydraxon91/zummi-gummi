"""Read PNG width/height from the IHDR chunk without third-party packages."""
import struct
import sys
from pathlib import Path

for name in sys.argv[1:]:
    data = Path(name).read_bytes()
    if data[:8] != b'\x89PNG\r\n\x1a\n' or data[12:16] != b'IHDR':
        raise SystemExit('not a PNG: %s' % name)
    width, height = struct.unpack('>II', data[16:24])
    print('%s %dx%d' % (name, width, height))
