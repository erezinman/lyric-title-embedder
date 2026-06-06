#!/usr/bin/env python3
"""SPIKE 1: overlapping \\t on the same property (\\fscx)."""
import harness as H

TIMES = [0.5, 2.0, 3.5, 4.0, 5.0, 6.0, 8.0]

VARIANTS = {
    "both": "{\\bord0\\shad0\\fscx100\\t(1000,5000,\\fscx300)\\t(3000,7000,\\fscx100)}HHHH",
    "first_only": "{\\bord0\\shad0\\fscx100\\t(1000,5000,\\fscx300)}HHHH",
    "reversed": "{\\bord0\\shad0\\fscx100\\t(3000,7000,\\fscx100)\\t(1000,5000,\\fscx300)}HHHH",
}

def run(name, text):
    p = H.write_ass(f"s1_{name}.ass", [("0:00:00.00", "0:00:10.00", text)])
    widths = {}
    for t in TIMES:
        img = H.load(H.render(p, t, f"s1_{name}_t{t}.png"))
        widths[t] = H.ink_width(img)
    base = widths[0.5]  # fscx 100 reference
    print(f"\n=== {name} ===")
    print(f"{'t':>6} {'width':>7} {'implied_fscx':>13}")
    for t in TIMES:
        implied = 100.0 * widths[t] / base
        print(f"{t:>6} {widths[t]:>7} {implied:>13.1f}")
    return widths, base

if __name__ == "__main__":
    for name, text in VARIANTS.items():
        run(name, text)
