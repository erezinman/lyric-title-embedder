#!/usr/bin/env python3
"""SPIKE 1 fine: dense sampling to characterize last-tag-wins vs blend."""
import harness as H

TIMES = [0.5,1.0,1.5,2.0,2.5,3.0,3.5,4.0,4.5,5.0,5.5,6.0,6.5,7.0,7.5,8.0]
VARIANTS = {
    "both": "{\\bord0\\shad0\\fscx100\\t(1000,5000,\\fscx300)\\t(3000,7000,\\fscx100)}HHHH",
    "reversed": "{\\bord0\\shad0\\t(3000,7000,\\fscx100)\\t(1000,5000,\\fscx300)\\fscx100}HHHH",
}
def run(name, text):
    p = H.write_ass(f"s1f_{name}.ass", [("0:00:00.00","0:00:10.00",text)])
    base=None; print(f"\n=== {name} ===\n{'t':>5}{'width':>7}{'fscx':>8}")
    rows=[]
    for t in TIMES:
        w=H.ink_width(H.load(H.render(p,t,f"s1f_{name}_t{t}.png")))
        if base is None: base=w
        rows.append((t,w,100.0*w/base))
    for t,w,f in rows: print(f"{t:>5}{w:>7}{f:>8.1f}")
if __name__=="__main__":
    for n,t in VARIANTS.items(): run(n,t)
