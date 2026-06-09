// animCustom.test.ts — custom-animation model helpers (zip-13). TDD RED: the
// module does not exist yet.
import { describe, it, expect } from "vitest";
import {
  isCustomAnim, DEFAULT_CUSTOM, CUSTOM_CHANNELS,
  buildCustom, customCfgOf, anchorSec, type CustomCfg,
} from "./animCustom";
import type { Animation } from "../types";

// deterministic id generator: a1, a2, a3, …
function idGen() {
  let n = 0;
  return () => "a" + ++n;
}

describe("isCustomAnim", () => {
  it("true for custom flag and for the legacy mode:'custom' sentinel", () => {
    expect(isCustomAnim({ custom: true } as Animation)).toBe(true);
    expect(isCustomAnim({ mode: "custom" } as unknown as Animation)).toBe(true);
  });
  it("false for plain presets", () => {
    expect(isCustomAnim({ mode: "percue" } as Animation)).toBe(false);
    expect(isCustomAnim({} as Animation)).toBe(false);
  });
});

describe("buildCustom", () => {
  it("DEFAULT_CUSTOM → one snap segment on cue_end −30ms, custom+percue", () => {
    const recs = buildCustom(DEFAULT_CUSTOM, idGen());
    expect(recs).toHaveLength(1);
    const a = recs[0];
    expect(a.custom).toBe(true);
    expect(a.mode).toBe("percue");
    expect(a.channel).toBe("primary");
    expect(a.group_id).toBeNull();
    const s = a.segments[0];
    expect(s.t0).toEqual({ anchor: "cue_end", offset: -30, unit: "ms" });
    expect(s.t1).toEqual({ anchor: "cue_end", offset: -30, unit: "ms" }); // snap = zero-length
    expect(s.to).toBe("#FF3DA6");
    expect(s.accel).toBe(1);
  });

  it("Scale → paired scale_x + scale_y sharing the lead group_id", () => {
    const cfg: CustomCfg = { ...DEFAULT_CUSTOM, ch: "scale_x", value: 120 };
    const recs = buildCustom(cfg, idGen());
    expect(recs.map((r) => r.channel)).toEqual(["scale_x", "scale_y"]);
    expect(recs[0].group_id).toBe(recs[0].id);
    expect(recs[1].group_id).toBe(recs[0].id);
    expect(recs[1].id).not.toBe(recs[0].id);
  });

  it("Ramp + Decelerate → t1 = offset+dur, accel 0.5", () => {
    const cfg: CustomCfg = { ...DEFAULT_CUSTOM, mode: "ramp", dur: 200, ease: "out" };
    const a = buildCustom(cfg, idGen())[0];
    expect(a.segments[0].t1.offset).toBe(DEFAULT_CUSTOM.offset + 200);
    expect(a.segments[0].accel).toBe(0.5);
  });

  it("carries timing (mode/step/step_unit/enabled) forward", () => {
    const a = buildCustom(DEFAULT_CUSTOM, idGen(), { mode: "cascade", step: 80, step_unit: "ms", enabled: false })[0];
    expect(a.mode).toBe("cascade");
    expect(a.step).toBe(80);
    expect(a.step_unit).toBe("ms");
    expect(a.enabled).toBe(false);
  });
});

describe("customCfgOf (inverse of buildCustom)", () => {
  it("round-trips a snap color cfg", () => {
    const a = buildCustom(DEFAULT_CUSTOM, idGen())[0];
    expect(customCfgOf(a)).toMatchObject({
      ch: "primary", anchor: "cue_end", offset: -30, mode: "snap", value: "#FF3DA6",
    });
  });
  it("round-trips a ramp cfg (dur + ease)", () => {
    const cfg: CustomCfg = { ...DEFAULT_CUSTOM, mode: "ramp", dur: 150, ease: "in" };
    const got = customCfgOf(buildCustom(cfg, idGen())[0]);
    expect(got.mode).toBe("ramp");
    expect(got.dur).toBe(150);
    expect(got.ease).toBe("in");
  });
});

describe("anchorSec (preview-only nominal-cue resolver)", () => {
  it("cue_end −30ms on a [0,1] cue ≈ 0.97", () => {
    expect(anchorSec([0, 1], { anchor: "cue_end", offset: -30, unit: "ms" })).toBeCloseTo(0.97, 5);
  });
  it("cue_start +250ms ≈ 0.25", () => {
    expect(anchorSec([0, 1], { anchor: "cue_start", offset: 250, unit: "ms" })).toBeCloseTo(0.25, 5);
  });
  it("frac scales by span length", () => {
    expect(anchorSec([0, 2], { anchor: "cue_start", offset: 0.5, unit: "frac" })).toBeCloseTo(1.0, 5);
  });
});

describe("CUSTOM_CHANNELS", () => {
  it("covers the engine-supported custom channels incl. the Slant stand-in", () => {
    const chs = CUSTOM_CHANNELS.map((c) => c.ch);
    for (const ch of ["primary", "outline", "fontsize", "scale_x", "shear_x", "blur", "border_w", "rot_z", "spacing"]) {
      expect(chs).toContain(ch);
    }
  });
});
