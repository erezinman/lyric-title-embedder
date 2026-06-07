# engine/anim_migrate.py — legacy-project conversion. UI-free.
#
# RED-PHASE STUB: raises NotImplementedError so AE-MIG-* fail for the right reason.
# Converts fin/fout tags, group.fade, globals fade_*_ms and accumulate into the
# settled animation carriers, then removes the legacy keys (idempotent).


def migrate_project(project):
    """Convert legacy fade fields into animation carriers. Return True if anything
    changed; idempotent."""
    raise NotImplementedError("anim_migrate.migrate_project")
