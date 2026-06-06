#!/usr/bin/env python3
"""SPIKE 3 (#5): \\kf karaoke fill with gap padding. Segment A(left)/B(right) by x."""
import harness as H

# Primary white, Secondary blue &H00FF0000 (AABBGGRR -> B=FF,G=00,R=00 = blue)
# \k100 lead-in (1.0s), \kf100 fill AAAA 1-2s, \k200 gap (2-4s), \kf100 fill BBBB 4-5s
TEXT_ONEBLOCK="{\\bord0\\shad0\\k100\\kf100}AAAA{\\k200\\kf100}BBBB"
TEXT_SEPBLOCK="{\\bord0\\shad0}{\\k100}{\\kf100}AAAA{\\k200}{\\kf100}BBBB"
TIMES=[0.5,1.5,2.5,3.0,4.5,6.0]

def classify(img, thresh=40):
    """Return list of (x, dominant) ink columns split into A/B halves; report per-half white/blue frac."""
    px=img.load(); w,h=img.size
    cols={}
    for x in range(w):
        white=blue=other=0
        for y in range(h):
            r,g,b=px[x,y]
            if r>thresh or g>thresh or b>thresh:
                if b>120 and r<80 and g<80: blue+=1
                elif r>120 and g>120 and b>120: white+=1
                else: other+=1
        if white+blue+other>0:
            cols[x]=(white,blue,other)
    if not cols: return None
    xs=sorted(cols)
    midx=(xs[0]+xs[-1])//2
    def agg(sel):
        wsum=bsum=osum=0
        for x in sel:
            wc,bc,oc=cols[x]; wsum+=wc; bsum+=bc; osum+=oc
        tot=wsum+bsum+osum
        if tot==0: return None
        return (wsum/tot, bsum/tot, osum/tot, tot)
    A=[x for x in xs if x<=midx]; B=[x for x in xs if x>midx]
    return agg(A), agg(B), (xs[0],xs[-1],midx)

def run(name,text):
    p=H.write_ass(f"s3_{name}.ass",[("0:00:00.00","0:00:10.00",text)])
    print(f"\n=== {name} ===")
    print(f"{'t':>5} | A(white,blue,other)        | B(white,blue,other)")
    for t in TIMES:
        img=H.load(H.render(p,t,f"s3_{name}_t{t}.png"))
        r=classify(img)
        if r is None:
            print(f"{t:>5} | NO INK"); continue
        A,B,span=r
        def fmt(z):
            if z is None: return "      none          "
            return f"w={z[0]:.2f} b={z[1]:.2f} o={z[2]:.2f}"
        print(f"{t:>5} | {fmt(A)} | {fmt(B)}   span={span}")

if __name__=="__main__":
    run("oneblock",TEXT_ONEBLOCK)
    run("sepblock",TEXT_SEPBLOCK)
