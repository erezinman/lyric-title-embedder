# tests/test_anim_migration.py — Cluster AE, 2F: migration (AE-MIG-01..08).
#
# legacy_project() carries fin_tags/fout_tags + group.fade + globals fade_*_ms +
# accumulate. migrate_project() converts them into the settled carriers and removes
# the legacy keys. The gold .ass (MIG-07) is captured from the CURRENT engine at test
# time — no golden file checked in.
import os, sys, copy
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import engine
from engine import anim_migrate
import anim_fixtures as fx


def _all_anims(p):
    """Every animation record across all carriers, by id."""
    out = {}
    for a in p.get("globals", {}).get("animations", []):
        out.setdefault("global", []).append(a)
    for gi, g in enumerate(p["layout"]):
        for a in g.get("animations", []):
            out.setdefault(f"group{gi}", []).append(a)
    for t in p.get("anim_tags", []):
        for a in t.get("anims", []):
            out.setdefault("tag", []).append(a)
    return out


# AE-MIG-01 — fin_tags/fout_tags {ids,trigger} → anim_tags fade_in/fade_out alpha anims.
def test_AE_MIG_01_fin_fout_to_anim_tags():
    p = fx.legacy_project()
    anim_migrate.migrate_project(p)
    tag_anims = [a for t in p.get("anim_tags", []) for a in t.get("anims", [])]
    names = {a["name"] for a in tag_anims}
    assert "fade_in" in names and "fade_out" in names
    assert all(a["channel"] == "alpha" for a in tag_anims if a["name"] in ("fade_in", "fade_out"))


# AE-MIG-02 — group.fade → group-scope alpha animations.
def test_AE_MIG_02_group_fade_to_group_anims():
    p = fx.legacy_project()    # group 0 has fade {fade_in_ms:500}
    anim_migrate.migrate_project(p)
    g0_anims = p["layout"][0].get("animations", [])
    assert any(a["channel"] == "alpha" for a in g0_anims)


# AE-MIG-03 — globals.fade_in_ms/fade_out_ms → global-scope alpha animations.
def test_AE_MIG_03_globals_fade_to_global_anims():
    p = fx.legacy_project()    # globals fade_in_ms 300 / fade_out_ms 800
    anim_migrate.migrate_project(p)
    g_anims = p.get("globals", {}).get("animations", [])
    assert any(a["channel"] == "alpha" for a in g_anims)


# AE-MIG-04 — trigger → cue_end-anchored offset (now FOLLOWS a retimed word).
def test_AE_MIG_04_trigger_to_cue_end_offset():
    p = fx.legacy_project()
    anim_migrate.migrate_project(p)
    # find the migrated fade_out (came from the fout tag with an explicit trigger)
    fades = [a for t in p.get("anim_tags", []) for a in t.get("anims", [])
             if a["name"] == "fade_out"]
    assert fades, "expected a migrated fade_out"
    fo = fades[0]
    anchors = {seg["t0"]["anchor"] for seg in fo["segments"]} | \
              {seg["t1"]["anchor"] for seg in fo["segments"]}
    assert "cue_end" in anchors        # trigger became a cue_end-anchored offset


# AE-MIG-05 — accumulate → timing mode (words→percue, lines→perline, off→together);
# the accumulate field is removed.
def test_AE_MIG_05_accumulate_to_mode():
    p = fx.legacy_project()    # group 0 accumulate "lines", group 1 "off"
    anim_migrate.migrate_project(p)
    # group 0 appearance anim → perline
    g0 = [a for a in p["layout"][0].get("animations", []) if a["channel"] == "alpha"]
    assert g0 and any(a.get("mode") == "perline" for a in g0)
    # group 1 appearance anim → together
    g1 = [a for a in p["layout"][1].get("animations", []) if a["channel"] == "alpha"]
    assert g1 and any(a.get("mode") == "together" for a in g1)
    assert "accumulate" not in p["layout"][0]


# AE-MIG-06 — post-migration the legacy fields are absent.
def test_AE_MIG_06_legacy_fields_removed():
    p = fx.legacy_project()
    anim_migrate.migrate_project(p)
    assert "fin_tags" not in p and "fout_tags" not in p
    assert "fade_in_ms" not in p["globals"] and "fade_out_ms" not in p["globals"]
    for g in p["layout"]:
        assert "fade" not in g and "accumulate" not in g


# AE-MIG-07 — GOLD TEST: build_ass(migrated) byte-identical to the pre-migration
# build_ass(legacy). gold is captured from the CURRENT engine at test time.
def test_AE_MIG_07_gold_ass_byte_identical():
    gold = fx.legacy_gold_ass()                 # captured from current engine, no golden file
    p = fx.legacy_project()
    anim_migrate.migrate_project(p)
    groups = engine.project_to_render(p)        # new path will emit resolved anims
    text, _n = engine.build_ass(fx.LEGACY_CFG, groups)
    assert text == gold


# AE-MIG-08 — migration is idempotent: migrating an already-migrated project is a no-op.
def test_AE_MIG_08_idempotent():
    p = fx.legacy_project()
    anim_migrate.migrate_project(p)
    once = copy.deepcopy(p)
    changed = anim_migrate.migrate_project(p)
    assert changed is False
    assert p == once        # no double fade records
