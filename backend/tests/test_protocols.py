import unittest

from fastapi import HTTPException

from app.core.protocols import choose_protocol, normalize_protocols


class ProtocolTests(unittest.TestCase):
    def test_normalize_protocols_requires_at_least_one_supported_protocol(self):
        with self.assertRaises(HTTPException):
            normalize_protocols([])

        with self.assertRaises(HTTPException):
            normalize_protocols(["pop"])

    def test_normalize_protocols_deduplicates_and_preserves_input_order(self):
        self.assertEqual(normalize_protocols(["imap", "graph", "imap"]), ["imap", "graph"])

    def test_choose_protocol_prefers_graph_over_imap(self):
        self.assertEqual(choose_protocol(["imap", "graph"]), "graph")
        self.assertEqual(choose_protocol(["imap"]), "imap")
        self.assertEqual(choose_protocol(["graph"]), "graph")


if __name__ == "__main__":
    unittest.main()
