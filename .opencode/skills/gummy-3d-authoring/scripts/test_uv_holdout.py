"""Pure scoring fixtures: no Blender, filesystem writes or application dependencies."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('uv_holdout', Path(__file__).with_name('uv_semantic_holdout.py'))
holdout = importlib.util.module_from_spec(spec)
spec.loader.exec_module(holdout)


class ScoringTests(unittest.TestCase):
    def test_stratified_selection_is_deterministic_and_excludes_prior_ids(self):
        records = [{'id': i, 'centroid': [0, i / 10, 0],
                    'normal': normal, 'uv_area': 1 / (i + 1)}
                   for i, normal in enumerate(([1, 0, 0], [-1, 0, 0], [0, 1, 0],
                                               [0, -1, 0], [0, 0, 1], [0, 0, -1]))]
        a = holdout.select_varied(records, {0}, 4)
        b = holdout.select_varied(list(reversed(records)), {0}, 4)
        self.assertEqual([r['id'] for r in a], [r['id'] for r in b])
        self.assertEqual(len(a), 4)
        self.assertNotIn(0, [r['id'] for r in a])
        self.assertEqual(len({tuple(r['normal']) for r in a}), 4)

    def setUp(self):
        self.doc = {'selected_ids': [25, 26, 27], 'excluded_ids': list(range(1, 25)),
                    'predictions': {'25': {'part_name': 'cab_floor_inner', 'status': 'automatic_proposal'},
                                    '26': {'part_name': 'unknown_26', 'status': 'unknown'},
                                    '27': {'part_name': 'hood', 'status': 'automatic_proposal'}}}
        self.labels = {'labels': {'25': {'part_name': 'cab_floor_inner', 'status': 'resolved'},
                                  '26': {'part_name': 'cab_floor_inner', 'status': 'resolved'},
                                  '27': {'status': 'unresolved'}}}

    def test_abstentions_are_not_correct(self):
        result = holdout.score(self.doc, self.labels)
        self.assertEqual(result['correct_exact'], 1)
        self.assertEqual(result['resolved'], 2)
        self.assertEqual(result['abstained_resolved'], 1)

    def test_unresolved_are_not_passes(self):
        result = holdout.score(self.doc, self.labels)
        self.assertEqual(result['unresolved'], 1)
        self.assertEqual(result['unresolved_named'], 1)
        self.assertIsNone(result['comparisons'][2]['correct'])

    def test_coarse_alias_not_silently_accepted(self):
        self.doc['predictions']['25']['part_name'] = 'front_floor_inner'
        self.assertEqual(holdout.score(self.doc, self.labels)['wrong_named'], 1)

    def test_missing_annotation_fails(self):
        del self.labels['labels']['27']
        with self.assertRaises(ValueError):
            holdout.score(self.doc, self.labels)

    def test_development_leakage_fails(self):
        self.doc['excluded_ids'].append(25)
        with self.assertRaises(ValueError):
            holdout.score(self.doc, self.labels)

    def test_duplicate_or_wrong_prediction_ids_fail(self):
        original = copy.deepcopy(self.doc)
        self.doc['selected_ids'].append(25)
        with self.assertRaises(ValueError):
            holdout.score(self.doc, self.labels)
        del original['predictions']['27']
        with self.assertRaises(ValueError):
            holdout.score(original, self.labels)


if __name__ == '__main__':
    unittest.main()
