"""Lecture d'archives MPQ par StormLib (ctypes) : les sons de D2 sont en ADPCM + Huffman, que l'importeur TypeScript ne décode pas.
StormLib n'est pas installée sur le système : `apt-get download libstorm9 libtomcrypt1 libtommath1` puis `dpkg -x` dans $D2_PRIVATE_DIR/tools/root
(voir README de tools/d2audio). Chemins configurables : D2_STORMLIB_DIR."""
import ctypes, os, sys

ROOT = os.environ.get('D2_STORMLIB_DIR', os.path.join(os.environ.get('D2_PRIVATE_DIR') or os.path.expanduser('~/d2-private'), 'tools/root'))
os.environ['LD_LIBRARY_PATH'] = f"{ROOT}/usr/lib/x86_64-linux-gnu:{ROOT}/usr/lib:" + os.environ.get('LD_LIBRARY_PATH', '')
for d in (f'{ROOT}/usr/lib/x86_64-linux-gnu', f'{ROOT}/usr/lib'):
    for n in ('libtommath.so.1', 'libtomcrypt.so.1'):
        p = os.path.join(d, n)
        if os.path.exists(p):
            ctypes.CDLL(p, mode=ctypes.RTLD_GLOBAL)
_lib = ctypes.CDLL(os.path.join(ROOT, 'usr/lib/libstorm.so.9'))
_lib.SFileGetFileSize.restype = ctypes.c_uint32
_lib.SFileReadFile.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_uint32, ctypes.POINTER(ctypes.c_uint32), ctypes.c_void_p]


class Archive:
    def __init__(self, path):
        self.h = ctypes.c_void_p()
        if not _lib.SFileOpenArchive(path.encode(), 0, 0x100, ctypes.byref(self.h)):  # lecture seule
            raise OSError(f'archive illisible : {path}')

    def get(self, name):
        """Contenu du fichier (bytes) ou None"""
        f = ctypes.c_void_p()
        if not _lib.SFileOpenFileEx(self.h, name.encode(), 0, ctypes.byref(f)):
            return None
        try:
            size = _lib.SFileGetFileSize(f, None)
            buf = ctypes.create_string_buffer(size)
            n = ctypes.c_uint32()
            _lib.SFileReadFile(f, buf, size, ctypes.byref(n), None)
            return buf.raw[: n.value]
        finally:
            _lib.SFileCloseFile(f)

    def close(self):
        _lib.SFileCloseArchive(self.h)


class Vfs:
    """Plusieurs archives, la dernière de la liste gagne (comme l'importeur)"""

    def __init__(self, paths):
        self.archives = [Archive(p) for p in paths]

    def get(self, name):
        for a in reversed(self.archives):
            d = a.get(name)
            if d is not None:
                return d
        return None
