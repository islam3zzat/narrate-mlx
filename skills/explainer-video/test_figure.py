"""Unit + path-confinement security tests for `figure` visual and `figures_host.py`."""
import json
import os
import tempfile
import unittest
from pathlib import Path

from figures_host import MAX_FIGURE_BYTES, probe_figure_aspect, resolve_figure, stage_figure, stage_figure_info
from test_semantics import tsx


def fig_vis(**kw):
    base = {
        "type": "figure",
        "heading": "Model Block Diagram",
        "src": "assets/sample-figure.png",
        "alt": "Three-stage pipeline schematic",
        "regions": [
            {"id": "enc", "label": "Encoder block", "x": 0.07, "y": 0.22, "w": 0.26, "h": 0.54},
            {"id": "gate", "label": "Router gate", "x": 0.39, "y": 0.27, "w": 0.22, "h": 0.43},
        ],
    }
    base.update(kw)
    return base


def script(vis, narration="Input enters the Encoder block, then passes through the Router gate.", **kw):
    sc = {"id": "s1", "narration": narration, "visual": vis}
    sc.update(kw.pop("scene", {}))
    return {"title": "t", "scenes": [sc], **kw}


def validate(scripts):
    return json.loads(tsx(["src/cli.ts", "validate"], json.dumps(scripts)))


class FigureSchemaTests(unittest.TestCase):
    def test_valid_figure_and_focus_pass(self):
        ok = script(fig_vis(), scene={"focus": [{"at": "Router", "on": ["gate"]}]})
        bad_focus = script(fig_vis(), scene={"focus": [{"at": "Router", "on": ["missing"]}]})
        res = validate({"ok": ok, "bad_focus": bad_focus})
        self.assertEqual(res["ok"], {"errors": [], "warnings": []})
        self.assertTrue(any('unknown id "missing"' in e for e in res["bad_focus"]["errors"]))

    def test_schema_rejects_traversal_and_oob_regions(self):
        res = validate({
            "trav": script(fig_vis(src="../secret.png")),
            "abs": script(fig_vis(src="/etc/passwd.png")),
            "win": script(fig_vis(src=r"assets\pic.png")),
            "url": script(fig_vis(src="https://evil.com/a.png")),
            "oob": script(fig_vis(regions=[{"label": "Overflow", "x": 0.8, "y": 0.1, "w": 0.3, "h": 0.2}])),
        })
        self.assertTrue(res["trav"]["errors"])
        self.assertTrue(res["abs"]["errors"])
        self.assertTrue(res["win"]["errors"])
        self.assertTrue(res["url"]["errors"])
        self.assertTrue(res["oob"]["errors"])


class FigureSecurityConfinementTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.work = self.root / "work"
        (self.work / "assets").mkdir(parents=True)
        self.outside = self.root / "secret.png"
        self.png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
        self.outside.write_bytes(self.png_bytes)

    def tearDown(self):
        self._tmp.cleanup()

    def test_valid_png_and_clean_svg_stage_cleanly(self):
        good_png = self.work / "assets/ok.png"
        good_png.write_bytes(self.png_bytes)
        good_svg = self.work / "assets/clean.svg"
        good_svg.write_text('<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>', encoding="utf-8")

        rel1, aspect1 = stage_figure_info(self.work, "assets/ok.png")
        rel2 = stage_figure(self.work, "assets/clean.svg")
        self.assertIsNone(aspect1)  # dummy PNG has 0x0 IHDR dims
        self.assertAlmostEqual(probe_figure_aspect(self.work / "assets/clean.svg"), 1.0)
        # Real PNG IHDR width=400, height=200 -> 2.0 aspect
        import struct, zlib
        ihdr = struct.pack("!IIBBBBB", 400, 200, 8, 2, 0, 0, 0)
        crc = struct.pack("!I", zlib.crc32(b"IHDR" + ihdr) & 0xFFFFFFFF)
        real_png = b"\x89PNG\r\n\x1a\n" + struct.pack("!I", 13) + b"IHDR" + ihdr + crc
        (self.work / "assets/rect.png").write_bytes(real_png)
        self.assertAlmostEqual(probe_figure_aspect(self.work / "assets/rect.png"), 2.0)
        self.assertTrue(rel1.startswith("figures/") and rel1.endswith(".png"))
        self.assertTrue(rel2.startswith("figures/") and rel2.endswith(".svg"))
        self.assertTrue((self.work / "public" / rel1).is_file())
        self.assertTrue((self.work / "public" / rel2).is_file())

    def test_rejects_traversal_symlinks_size_and_spoofed_magic(self):
        with self.assertRaises(ValueError):
            resolve_figure(self.work, "../secret.png")
        with self.assertRaises(ValueError):
            resolve_figure(self.work, str(self.outside))
        with self.assertRaises(ValueError):
            resolve_figure(self.work, "assets\\ok.png")

        # Symlink file escaping workdir
        sym_file = self.work / "assets/link.png"
        os.symlink(self.outside, sym_file)
        with self.assertRaises(ValueError):
            resolve_figure(self.work, "assets/link.png")

        # Symlink intermediate directory even pointing inside workdir
        sym_dir = self.work / "sub"
        os.symlink(self.work / "assets", sym_dir)
        good = self.work / "assets/inner.png"
        good.write_bytes(self.png_bytes)
        with self.assertRaises(ValueError):
            resolve_figure(self.work, "sub/inner.png")

        # Oversized file (>10 MB)
        big = self.work / "assets/huge.png"
        with big.open("wb") as f:
            f.write(b"\x89PNG\r\n\x1a\n")
            f.seek(MAX_FIGURE_BYTES)
            f.write(b"\x00")
        with self.assertRaises(ValueError):
            resolve_figure(self.work, "assets/huge.png")

        # Spoofed extension / magic bytes
        spoof = self.work / "assets/fake.png"
        spoof.write_bytes(b"<html><body>not a png</body></html>")
        with self.assertRaises(ValueError):
            resolve_figure(self.work, "assets/fake.png")

    def test_rejects_unsafe_svg_payloads(self):
        payloads = [
            '<svg><script>alert(1)</script></svg>',
            '<svg onload="alert(1)"><rect width="10" height="10"/></svg>',
            '<svg><foreignObject><body>hi</body></foreignObject></svg>',
            '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>',
            '<svg><a href="https://evil.example"><rect width="10" height="10"/></a></svg>',
            '<svg><image xlink:href="javascript:alert(1)"/></svg>',
        ]
        for idx, body in enumerate(payloads):
            p = self.work / f"assets/bad_{idx}.svg"
            p.write_text(body, encoding="utf-8")
            with self.assertRaises(ValueError, msg=f"Should reject unsafe SVG {body}"):
                resolve_figure(self.work, f"assets/bad_{idx}.svg")


if __name__ == "__main__":
    unittest.main()
