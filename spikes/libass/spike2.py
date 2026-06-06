#!/usr/bin/env python3
"""SPIKE 2: is \\clip(x1,y1,x2,y2) interpolated under \\t?"""
import harness as H

TIMES=[0.5,1.0,3.0,5.0,7.0,9.0,9.5]
text="{\\bord0\\shad0\\clip(0,0,0,720)\\t(1000,9000,\\clip(0,0,1280,720))}WIPETEST"

if __name__=="__main__":
    p=H.write_ass("s2.ass",[("0:00:00.00","0:00:10.00",text)])
    # reference full width with no clip
    pref=H.write_ass("s2_ref.ass",[("0:00:00.00","0:00:10.00","{\\bord0\\shad0}WIPETEST")])
    full=H.ink_width(H.load(H.render(pref,5,"s2_ref.png")))
    print("unclipped full width:",full)
    print(f"{'t':>5}{'width':>7}{'frac_of_full':>13}")
    for t in TIMES:
        w=H.ink_width(H.load(H.render(p,t,f"s2_t{t}.png")))
        print(f"{t:>5}{w:>7}{(w/full):>13.2f}")
