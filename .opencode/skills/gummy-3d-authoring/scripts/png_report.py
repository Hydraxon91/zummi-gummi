"""Standard-library PNG validation for non-interlaced 8-bit L/RGB/LA/RGBA assets.

This is structural validation, not UV correspondence or appearance certification.
Unsupported formats fail explicitly. No files are modified.
"""
import argparse
import json
from pathlib import Path
import struct
import zlib


def decode(raw):
    if raw[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Invalid PNG signature')
    pos, header, blocks, ended, idat_closed = 8, None, [], False, False
    while pos < len(raw):
        if pos + 12 > len(raw):
            raise ValueError('Truncated chunk')
        length = struct.unpack_from('>I', raw, pos)[0]
        kind = raw[pos + 4:pos + 8]
        end = pos + 12 + length
        if end > len(raw):
            raise ValueError('Truncated chunk payload')
        data = raw[pos + 8:pos + 8 + length]
        crc = struct.unpack_from('>I', raw, pos + 8 + length)[0]
        if zlib.crc32(kind + data) & 0xffffffff != crc:
            raise ValueError('Chunk CRC mismatch: ' + repr(kind))
        if header is None and kind != b'IHDR':
            raise ValueError('IHDR must be first')
        if kind == b'IHDR':
            if header is not None or len(data) != 13:
                raise ValueError('Invalid/duplicate IHDR')
            header = struct.unpack('>IIBBBBB', data)
        elif kind == b'IDAT':
            if idat_closed:
                raise ValueError('Nonconsecutive IDAT chunks')
            blocks.append(data)
        elif kind == b'IEND':
            if data or end != len(raw):
                raise ValueError('Invalid IEND or trailing bytes')
            ended = True
            break
        elif kind[0] & 32 == 0 and kind != b'PLTE':
            raise ValueError('Unsupported critical chunk: ' + repr(kind))
        if blocks and kind != b'IDAT':
            idat_closed = True
        pos = end
    if not ended or header is None or not blocks:
        raise ValueError('Missing IHDR/IDAT/IEND')
    width, height, depth, color_type, compression, filtering, interlace = header
    if not width or not height or depth != 8 or color_type not in (0, 2, 4, 6):
        raise ValueError('Unsupported dimensions/bit depth/colour type')
    if compression or filtering or interlace:
        raise ValueError('Unsupported compression/filter method/interlace')
    channels = {0: 1, 2: 3, 4: 2, 6: 4}[color_type]
    stride = width * channels
    expected = height * (stride + 1)
    if expected > 256 * 1024 * 1024:
        raise ValueError('Decoded image exceeds 256 MiB safety limit')
    stream = zlib.decompressobj()
    inflated = stream.decompress(b''.join(blocks), expected + 1)
    if len(inflated) != expected or not stream.eof or stream.unused_data or stream.unconsumed_tail:
        raise ValueError('IDAT size/stream mismatch: expected %d scanline bytes, got %d' %
                         (expected, len(inflated)))
    rows, previous = [], bytearray(stride)
    for y in range(height):
        offset = y * (stride + 1)
        method = inflated[offset]
        if method > 4:
            raise ValueError('Invalid scanline filter')
        row = bytearray(inflated[offset + 1:offset + 1 + stride])
        if method:
            for x in range(stride):
                left = row[x - channels] if x >= channels else 0
                above = previous[x]
                corner = previous[x - channels] if x >= channels else 0
                if method == 1:
                    predictor = left
                elif method == 2:
                    predictor = above
                elif method == 3:
                    predictor = (left + above) // 2
                else:
                    p = left + above - corner
                    distances = [abs(p - left), abs(p - above), abs(p - corner)]
                    predictor = (left, above, corner)[distances.index(min(distances))]
                row[x] = (row[x] + predictor) & 255
        rows.append(bytes(row))
        previous = row
    return width, height, channels, rows


def inspect(path):
    width, height, channels, _ = decode(Path(path).read_bytes())
    return {'path': str(path), 'width': width, 'height': height, 'channels': channels,
            'valid_supported_png': True,
            'unverified': ['UV correspondence, padding, colour management and visual quality']}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('path')
    args = parser.parse_args()
    print(json.dumps(inspect(args.path), indent=2))
