// AnimSection.tsx — the Inspector animations block (append-override model).
// Ported from ui_kits/desktop-app/ia.js (Option D) + ia.css (.tier.append, .ov-row,
// .tomb, .add-row, .inh-disc) per HANDOFF_animations §2.
//
// Renders one append-style tier per scope (GLOBAL base / GROUP / CUE). Each tier:
//   - own rows (.ov-row.anim-ov): edit ✎ → enable/disable, remove ✕
//   - tombstone rows (.ov-row.tomb): "⊘ name — removed here" + restore ↺
//   - ＋ Add animation ▾ → preset picker
//   - ▸ Inherited (n) disclosure → reveals inherited + tombstone rows; remove from
//     within dispatches against the NARROW scope (override-here / tombstone-here).
//
// Dispatch contract (handlers wired by Editor):
//   onAdd(scope, ref, anim)         — one call per preset record (siblings share group_id)
//   onRemove(scope, ref, anim_id)
//   onRestore(scope, ref, anim_id)
//   onSetProps(scope, ref, anim_id, partial)
import { useState } from "react";
import { Icon } from "../icons/Icon";
import type { Project, Animation } from "../../types";
import { globalRows, groupRows, cueRows, inheritedCount, type AnimRow } from "../../model/animRows";
import { PRESETS, buildPreset, freshAnimId, type PresetKey } from "../../model/animPresets";

export type AnimScope = "global" | "group" | "cue";

export interface AnimSectionProps {
  project: Project;
  scope: AnimScope;
  gi: number;
  /** selected cue word id (CUE scope only). */
  selWid: number | null;
  onAdd: (scope: AnimScope, ref: number | number[] | null, anim: Animation) => void;
  onRemove: (scope: AnimScope, ref: number | number[] | null, anim_id: string) => void;
  onRestore: (scope: AnimScope, ref: number | number[] | null, anim_id: string) => void;
  onSetProps: (scope: AnimScope, ref: number | number[] | null, anim_id: string, partial: Record<string, unknown>) => void;
  /** select all cues a tag spans (the "N cues" chip). */
  onSelectCues: (ids: number[]) => void;
}

export function AnimSection({ project, scope, gi, selWid, onAdd, onRemove, onRestore, onSetProps, onSelectCues }: AnimSectionProps) {
  return (
    <div className="anim-section">
      <div className="sec-t cyan">
        <Icon name="sparkles" size={13} /> Animation
      </div>
      <div className="sec-sub">Same global → group → cue waterfall as style. Tiers append only what they override.</div>
      {selWid != null && (
        <AnimTier
          tierScope="cue" project={project} gi={gi} selWid={selWid}
          onAdd={onAdd} onRemove={onRemove} onRestore={onRestore} onSetProps={onSetProps} onSelectCues={onSelectCues}
        />
      )}
      <AnimTier
        tierScope="group" project={project} gi={gi} selWid={selWid}
        onAdd={onAdd} onRemove={onRemove} onRestore={onRestore} onSetProps={onSetProps} onSelectCues={onSelectCues}
      />
      <AnimTier
        tierScope="global" project={project} gi={gi} selWid={selWid}
        onAdd={onAdd} onRemove={onRemove} onRestore={onRestore} onSetProps={onSetProps} onSelectCues={onSelectCues}
      />
      {void scope}
    </div>
  );
}

// ---- ref for a tier scope (the dispatch's `ref` arg) ----
function refFor(tierScope: AnimScope, gi: number, selWid: number | null, row?: AnimRow): number | number[] | null {
  if (tierScope === "global") return null;
  if (tierScope === "group") return gi;
  // cue scope → the tag's full ids when acting on a tag row; else the single cue
  if (row?.tag) return [...row.tag.ids];
  return selWid != null ? [selWid] : [];
}

function tierLabel(tierScope: AnimScope, project: Project, gi: number, selWid: number | null): string {
  if (tierScope === "global") return "defaults";
  if (tierScope === "group") return project.layout[gi]?.label ?? "";
  return selWid != null ? `"${project.words[selWid]?.text ?? ""}"` : "";
}

interface TierInner extends Omit<AnimSectionProps, "scope"> { tierScope: AnimScope; }

function AnimTier({ tierScope, project, gi, selWid, onAdd, onRemove, onRestore, onSetProps, onSelectCues }: TierInner) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [discOpen, setDiscOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const rows: AnimRow[] =
    tierScope === "global" ? globalRows(project)
    : tierScope === "group" ? groupRows(project, gi)
    : cueRows(project, gi, selWid ?? -1);

  const own = rows.filter((r) => r.kind === "own");
  const inherited = rows.filter((r) => r.kind !== "own");
  const tag = tierScope === "global" ? "GLOBAL" : tierScope === "group" ? "GROUP" : "CUE";
  const isGlobal = tierScope === "global";

  const addPreset = (key: PresetKey) => {
    setPickerOpen(false);
    const taken = new Set<string>();
    for (const a of project.globals.animations) taken.add(a.id);
    for (const g of project.layout) for (const a of g.animations) taken.add(a.id);
    for (const t of project.anim_tags) for (const a of t.anims) taken.add(a.id);
    const recs = buildPreset(key, () => { const id = freshAnimId(taken); taken.add(id); return id; });
    for (const rec of recs) onAdd(tierScope, refFor(tierScope, gi, selWid), rec);
  };

  return (
    <div className={"tier append " + tierScope}>
      <div className="tier-h">
        <span className={"ttag " + tierScope}>{tag}</span>
        {tierLabel(tierScope, project, gi, selWid)}
      </div>
      <div className="tier-body">
        {own.length === 0 && !isGlobal && (
          <div className="empty-row">Inherits everything from {tierScope === "cue" ? "group" : "global"}</div>
        )}
        {own.map((r) => (
          <AnimOwnRow
            key={r.id} row={r} tierScope={tierScope} gi={gi} selWid={selWid}
            editing={editing === r.id} onToggleEdit={() => setEditing((e) => (e === r.id ? null : r.id))}
            onRemove={onRemove} onSetProps={onSetProps} onSelectCues={onSelectCues}
          />
        ))}
        {!isGlobal && (
          <>
            <div className="add-row">
              <button type="button" className="add-btn cyan" onClick={() => setPickerOpen((o) => !o)}>
                ＋ Add animation <span className="caret">▾</span>
              </button>
            </div>
            {pickerOpen && <PresetPicker tierScope={tierScope} onPick={addPreset} />}
            <button type="button" className="inh-disc" onClick={() => setDiscOpen((o) => !o)}>
              {discOpen ? "▾" : "▸"} Inherited ({inheritedCount(rows)})
            </button>
            {discOpen && inherited.map((r) => (
              <AnimInheritedRow
                key={r.src + r.id} row={r} tierScope={tierScope} gi={gi} selWid={selWid}
                onRemove={onRemove} onRestore={onRestore}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function AnimOwnRow({
  row, tierScope, gi, selWid, editing, onToggleEdit, onRemove, onSetProps, onSelectCues,
}: {
  row: AnimRow; tierScope: AnimScope; gi: number; selWid: number | null; editing: boolean;
  onToggleEdit: () => void;
  onRemove: TierInner["onRemove"]; onSetProps: TierInner["onSetProps"]; onSelectCues: TierInner["onSelectCues"];
}) {
  const ref = refFor(tierScope, gi, selWid, row);
  return (
    <div className="ov-row anim-ov">
      <span className="ov-ic cyan"><Icon name="sparkles" size={13} /></span>
      <span className="ov-main">
        <b>{row.name}</b>
        {row.cueCount > 1 && (
          <button type="button" className="chip cues-chip" onClick={() => row.tag && onSelectCues([...row.tag.ids])}>
            {row.cueCount} cues
          </button>
        )}
      </span>
      <button type="button" className="ov-act" title="Edit" aria-label="Edit" onClick={onToggleEdit}>✎</button>
      <button
        type="button" className="ov-act" title="Remove animation" aria-label="Remove animation"
        onClick={() => onRemove(tierScope, ref, row.id)}
      >✕</button>
      {editing && (
        <div className="ov-edit" style={{ flexBasis: "100%" }}>
          <button
            type="button" className="ov-act"
            aria-label={row.anim.enabled ? "Disable" : "Enable"}
            onClick={() => onSetProps(tierScope, ref, row.id, { enabled: !row.anim.enabled })}
          >{row.anim.enabled ? "Disable" : "Enable"}</button>
        </div>
      )}
    </div>
  );
}

function AnimInheritedRow({
  row, tierScope, gi, selWid, onRemove, onRestore,
}: {
  row: AnimRow; tierScope: AnimScope; gi: number; selWid: number | null;
  onRemove: TierInner["onRemove"]; onRestore: TierInner["onRestore"];
}) {
  const ref = refFor(tierScope, gi, selWid, row);
  if (row.kind === "tombstone") {
    return (
      <div className="ov-row tomb">
        <span className="ov-ic"><Icon name="close" size={13} /></span>
        <span className="ov-main"><b>{row.name}</b> <span className="tomb-lbl">removed here</span></span>
        <button
          type="button" className="ov-act" title="Restore inherited" aria-label="Restore"
          onClick={() => onRestore(tierScope, ref, row.id)}
        >↺</button>
      </div>
    );
  }
  return (
    <div className="ov-row inherited">
      <span className="ov-ic"><Icon name="sparkles" size={13} /></span>
      <span className="ov-main"><b>{row.name}</b> <span className="ov-sub">{row.src}</span></span>
      <button
        type="button" className="ov-act" title="Remove animation" aria-label="Remove animation"
        onClick={() => onRemove(tierScope, ref, row.id)}
      >✕</button>
    </div>
  );
}

function PresetPicker({ tierScope, onPick }: { tierScope: AnimScope; onPick: (k: PresetKey) => void }) {
  return (
    <div className="preset-picker preset-row">
      {PRESETS.map((p) => {
        const disabled = !!p.groupGlobalOnly && tierScope === "cue";
        return (
          <button
            key={p.key}
            type="button"
            className="preset"
            disabled={disabled}
            title={disabled ? "Group-level only" : p.label}
            onClick={() => { if (!disabled) onPick(p.key); }}
          >
            <span className="pv-nm">{p.label}</span>
          </button>
        );
      })}
    </div>
  );
}
