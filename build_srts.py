#!/usr/bin/env python3
"""Build 3 SRT variants from the Bleating Obsession song mapping."""

def fmt(t: float) -> str:
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = int(t % 60)
    ms = int(round((t - int(t)) * 1000))
    if ms == 1000:
        s += 1
        ms = 0
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


# (section, text, start_seconds, end_seconds) — reconstructed real lyric lines.
LINES = [
    ("Intro",        "*Baa... baa...*",                                            0.540,  12.367),
    ("Intro",        "In the desert night, under crescent moon...",               12.367,  21.064),
    ("Intro",        "Abdallah walks alone...",                                   21.064,  52.021),
    ("Verse 1",      "Abdallah, son of the burning sand",                         52.021,  55.292),
    ("Verse 1",      "Four wives in his tent, gold rings on their hands",         55.292,  65.266),
    ("Verse 1",      "Layla cooks the rice, Fatima warms the bed",                65.266,  71.489),
    ("Verse 1",      "Aisha sings sweet songs, and Zara turns her head",          71.489,  78.750),
    ("Verse 1",      "They move like shadows, they whisper his name",             78.750,  82.021),
    ("Verse 1",      "But his eyes are distant, lost in the flame",               82.021,  85.611),
    ("Verse 1",      "He feeds them dates and honeyed lies",                      85.611,  89.043),
    ("Verse 1",      "But his heart is beating where the pasture lies",           89.043,  96.222),
    ("Chorus 1",     "Oh, my four wives, what have I done?",                      96.222, 103.483),
    ("Chorus 1",     "Silk and perfume, but I crave the wool of one",            103.483, 110.346),
    ("Chorus 1",     "Her eyes are black, her fleece so white",                  110.346, 115.691),
    ("Chorus 1",     "Under the stars, I hold her tight",                        115.691, 117.605),
    ("Chorus 1",     "*Baa-aa-aa...* (sheep bleat echoes)",                      117.605, 123.191),
    ("Chorus 1",     "I'm torn between heaven and this cursed delight",          123.191, 130.850),
    ("Chorus 1",     "Abdallah's lost to the bleating night!",                   130.850, 136.596),
    ("Verse 2",      "They call him in the dark, their bodies like fire",        136.596, 152.394),
    ("Verse 2",      "But his blood runs cold with forbidden desire",            152.394, 155.824),
    ("Verse 2",      "He slips from their arms when the moon is high",           155.824, 159.175),
    ("Verse 2",      "To the quiet corral where his true love lies",             159.175, 163.085),
    ("Verse 2",      "Soft and trembling, innocent and pure",                    163.085, 166.116),
    ("Verse 2",      "One gentle creature makes his spirit stir",                166.116, 169.627),
    ("Verse 2",      "The wives, they suspect, they see the shame",              169.627, 173.058),
    ("Verse 2",      "But passion's a desert no man can tame",                   173.058, 176.010),
    ("Chorus 2",     "Oh, my four wives, forgive this sin",                      176.010, 185.745),
    ("Chorus 2",     "Your beauty's wasted on a heart of tin",                   185.745, 192.605),
    ("Chorus 2",     "She doesn't speak, she doesn't demand",                    192.605, 193.406),
    ("Chorus 2",     "Kissing her forehead, whispering low",                     193.406, 196.703),
    ("Chorus 2",     "\"My only true love, never let me go...\"",                196.703, 199.467),
    ("Chorus 2",     "Just one soft *baa* and I'm in her hands",                 199.467, 205.611),
    ("Chorus 2",     "A man of the faith, a slave to the beast",                 205.611, 212.473),
    ("Chorus 2",     "This love is my curse, this love is my release!",          212.473, 221.729),
    ("Bridge",       "Allah forgive me... I tried to be strong",                 221.729, 228.590),
    ("Bridge",       "But her wool calls louder than any love song",             228.590, 235.212),
    ("Bridge",       "The wives plot in whispers, knives in their eyes",         235.212, 238.085),
    ("Bridge",       "They know the truth behind my alibis",                     238.085, 245.745),
    ("Bridge",       "One day they'll find us, tangled in sin",                  245.745, 252.287),
    ("Bridge",       "Man and his sheep where the madness begins...",            252.287, 298.963),
    ("Final Chorus", "Four wives in mourning, black veils in the wind",          298.963, 306.064),
    ("Final Chorus", "While Abdallah lies where the pastures end",               306.064, 312.766),
    ("Final Chorus", "Kissing her forehead, whispering low",                     312.766, 319.228),
    ("Final Chorus", "\"My only true love, never let me go...\"",                319.228, 325.451),
    ("Final Chorus", "*Baa...*",                                                 325.451, 326.089),
    ("Final Chorus", "I'm damned, I'm free, in this twisted romance",            326.089, 333.031),
    ("Final Chorus", "Abdallah and his sheep... in eternal trance...",           333.031, 347.153),
    ("Outro",        "*Baa... baa...*",                                          347.153, 357.048),
    ("Outro",        "In the desert... forever...",                              357.048, 358.564),
]


def write_srt(path, entries):
    """entries: list of (text, start, end)."""
    with open(path, "w", encoding="utf-8") as f:
        for i, (text, start, end) in enumerate(entries, 1):
            f.write(f"{i}\n{fmt(start)} --> {fmt(end)}\n{text}\n\n")


# Version 1: combine by section
def by_section():
    out = []
    cur_section = None
    cur_lines = []
    cur_start = None
    cur_end = None
    for section, text, s, e in LINES:
        if section != cur_section:
            if cur_section is not None:
                out.append(("\n".join(cur_lines), cur_start, cur_end))
            cur_section = section
            cur_lines = [text]
            cur_start = s
            cur_end = e
        else:
            cur_lines.append(text)
            cur_end = e
    if cur_section is not None:
        out.append(("\n".join(cur_lines), cur_start, cur_end))
    return out


# Version 2: non-overlapping pairs (1,2),(3,4),(5,6)...
def pairs_non_overlapping():
    out = []
    i = 0
    while i < len(LINES):
        a = LINES[i]
        if i + 1 < len(LINES):
            b = LINES[i + 1]
            out.append((a[1] + "\n" + b[1], a[2], b[3]))
            i += 2
        else:
            out.append((a[1], a[2], a[3]))
            i += 1
    return out


# Version 3: sliding window pairs (1,2),(2,3),(3,4)...
def pairs_sliding():
    out = []
    for i in range(len(LINES) - 1):
        a = LINES[i]
        b = LINES[i + 1]
        out.append((a[1] + "\n" + b[1], a[2], b[3]))
    return out


import os
base = os.path.dirname(os.path.abspath(__file__))
write_srt(os.path.join(base, "bleating_v1_by_section.srt"), by_section())
write_srt(os.path.join(base, "bleating_v2_pairs.srt"), pairs_non_overlapping())
write_srt(os.path.join(base, "bleating_v3_sliding_pairs.srt"), pairs_sliding())
print("wrote 3 SRTs")
