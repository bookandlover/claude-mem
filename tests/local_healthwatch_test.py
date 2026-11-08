import importlib.util
import unittest
from unittest.mock import patch
from pathlib import Path
spec = importlib.util.spec_from_file_location('watch', Path(__file__).resolve().parents[1] / 'scripts/local/claude_mem_healthwatch.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)
class PolicyTest(unittest.TestCase):
    def test_old_restore_never_probes_claude(self):
        state = {'failover': {'restore': {'CLAUDE_MEM_PROVIDER': 'claude'}, 'last_probe': 0}}
        with patch.object(w, 'load_json', return_value={'CLAUDE_MEM_PROVIDER': 'codex'}), patch.object(w.subprocess, 'run', side_effect=AssertionError('no CLI probes allowed')), patch.object(w, 'backup_settings'), patch.object(w, 'write_settings'), patch.object(w, 'nudge_worker'):
            w.auto_failover(state, force_probe=True)
        self.assertNotIn('failover', state)
    def test_claude_manual_switch_rejected(self):
        with self.assertRaises(ValueError):
            w.switch('claude')
if __name__ == '__main__': unittest.main()
