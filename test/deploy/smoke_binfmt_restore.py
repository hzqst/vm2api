#!/usr/bin/env python3
"""Exercise real binfmt rollback only on a disposable GitHub ARM runner."""

import importlib.util
import os
from pathlib import Path
import sys
from unittest import mock


def main():
    if os.environ.get("GITHUB_ACTIONS") != "true":
        raise SystemExit("This integration check is restricted to disposable GitHub Actions runners")
    script = Path(__file__).resolve().parents[2] / "deploy" / "prepare-arm64.py"
    spec = importlib.util.spec_from_file_location("prepare_arm64_restore", script)
    arm64 = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = arm64
    spec.loader.exec_module(arm64)
    ops = arm64.Operations()
    arm64.check(ops)
    original = ops.kernel_handler()
    original_files = {p: ops.managed_bytes(p) for p in (arm64.QEMU, arm64.CONF)}
    register = ops.register_managed

    def fail_after_registration():
        register()
        raise arm64.PrepareError("injected failure after kernel registration")

    try:
        for enabled in (True, False, None):
            snapshot = (arm64.Handler(enabled, original.interpreter, original.offset,
                                      original.magic, original.mask, "F") if enabled is not None else None)
            ops.remove_handler()
            if snapshot is not None:
                ops.restore_handler(snapshot)
            assert ops.kernel_handler() == snapshot
            with mock.patch.object(ops, "register_managed", side_effect=fail_after_registration):
                try:
                    arm64.prepare(ops)
                except arm64.PrepareError as exc:
                    assert "injected failure" in str(exc) and "; rollback completed" in str(exc), str(exc)
                else:
                    raise AssertionError("The injected registration failure was not exercised")
            assert ops.kernel_handler() == snapshot, "Kernel snapshot was not restored"
            assert {p: ops.managed_bytes(p) for p in original_files} == original_files
            print(f"PASS: actual kernel rollback, previous enabled={enabled}")
    finally:
        ops.remove_handler()
        ops.restore_handler(original)
        arm64.check(ops)


if __name__ == "__main__":
    main()
