import unittest
from unittest.mock import patch

from app.services.mail_service import (
    fetch_graph_email_list,
    fetch_imap_email_list,
    get_access_token,
    test_graph_email_access,
    test_imap_email_access,
)


class MailServiceTests(unittest.TestCase):
    def test_graph_token_refresh_uses_default_scope(self):
        captured = {}

        class Response:
            status_code = 200

            def json(self):
                return {"access_token": "access", "refresh_token": "new-refresh"}

        def fake_post(url, data, timeout):
            captured.update(data)
            return Response()

        with patch("app.services.mail_service.requests.post", fake_post):
            get_access_token("client", "refresh", "graph")

        self.assertEqual(captured["scope"], "https://graph.microsoft.com/.default")

    def test_imap_email_list_returns_all_metadata_with_internaldate_timestamp(self):
        class FakeMail:
            def select(self, folder, readonly=True):
                return "OK", []

            def uid(self, command, *args):
                if command == "search":
                    return "OK", [b"101 102"]
                if command == "fetch":
                    return "OK", [
                        (
                            b'1 (UID 101 INTERNALDATE "28-May-2026 10:00:00 +0800" BODY[HEADER.FIELDS (FROM SUBJECT DATE)] {105}',
                            b"From: Sender <sender@example.com>\r\n"
                            b"Subject: With date\r\n"
                            b"Date: Thu, 28 May 2026 09:30:00 +0800\r\n"
                            b"\r\n",
                        ),
                        b")",
                        (
                            b'2 (UID 102 INTERNALDATE "28-May-2026 11:00:00 +0800" BODY[HEADER.FIELDS (FROM SUBJECT DATE)] {64}',
                            b"From: Other <other@example.com>\r\n"
                            b"Subject: No date\r\n"
                            b"\r\n",
                        ),
                        b")",
                    ]
                raise AssertionError(f"unexpected uid command {command}")

            def logout(self):
                pass

        with patch("app.services.mail_service._imap_connect", return_value=(FakeMail(), "new-refresh", None)):
            emails, remote_ids, _, _ = fetch_imap_email_list(
                "user@example.com",
                "client",
                "refresh",
                "INBOX",
                known_external_ids={"101"},
            )

        self.assertEqual(remote_ids, ["101", "102"])
        self.assertEqual([email["external_id"] for email in emails], ["101", "102"])
        self.assertEqual([email["received_ts_ms"] for email in emails], [
            1779933600000,
            1779937200000,
        ])

    def test_graph_email_list_uses_received_timestamp(self):
        pages = [
            {
                "value": [
                    {
                        "id": "m1",
                        "from": {"emailAddress": {"name": "Sender", "address": "sender@example.com"}},
                        "subject": "First",
                        "receivedDateTime": "2026-05-28T08:42:01Z",
                    }
                ],
                "@odata.nextLink": "next-page",
            },
            {
                "value": [
                    {
                        "id": "m2",
                        "from": {"emailAddress": {"address": "other@example.com"}},
                        "subject": "Second",
                        "receivedDateTime": "2026-05-28T08:40:00Z",
                    }
                ],
            },
        ]
        calls = []

        def fake_graph_get(url, access_token, params=None):
            calls.append((url, params))
            return pages.pop(0)

        with patch("app.services.mail_service.get_access_token", return_value=("access", "new-refresh", None)):
            with patch("app.services.mail_service._graph_get", fake_graph_get):
                emails, remote_ids, _, _ = fetch_graph_email_list(
                    "user@example.com",
                    "client",
                    "refresh",
                    "INBOX",
                )

        self.assertEqual(remote_ids, ["m1", "m2"])
        self.assertEqual([email["received_ts_ms"] for email in emails], [
            1779957721000,
            1779957600000,
        ])
        self.assertEqual(calls[0][1]["$orderby"], "receivedDateTime desc")
        self.assertIsNone(calls[1][1])

    def test_imap_email_list_raises_when_header_fetch_fails(self):
        class FakeMail:
            def select(self, folder, readonly=True):
                return "OK", []

            def uid(self, command, *args):
                if command == "search":
                    return "OK", [b"101"]
                if command == "fetch":
                    return "NO", [b"temporary failure"]
                raise AssertionError(f"unexpected uid command {command}")

            def logout(self):
                pass

        with patch("app.services.mail_service._imap_connect", return_value=(FakeMail(), "new-refresh", None)):
            with self.assertRaises(Exception):
                fetch_imap_email_list("user@example.com", "client", "refresh", "INBOX")

    def test_imap_access_test_succeeds_with_empty_mailbox(self):
        class FakeMail:
            def select(self, folder, readonly=True):
                return "OK", []

            def uid(self, command, *args):
                if command == "search":
                    return "OK", [b""]
                raise AssertionError(f"unexpected uid command {command}")

            def logout(self):
                pass

        with patch("app.services.mail_service._imap_connect", return_value=(FakeMail(), "new-refresh", None)):
            new_refresh_token, rt_expires_in = test_imap_email_access(
                "user@example.com",
                "client",
                "refresh",
                "INBOX",
            )

        self.assertEqual(new_refresh_token, "new-refresh")
        self.assertIsNone(rt_expires_in)

    def test_graph_access_test_uses_minimal_message_query(self):
        calls = []

        def fake_graph_get(url, access_token, params=None):
            calls.append((url, access_token, params))
            return {"value": []}

        with patch("app.services.mail_service.get_access_token", return_value=("access", "new-refresh", None)):
            with patch("app.services.mail_service._graph_get", fake_graph_get):
                new_refresh_token, rt_expires_in = test_graph_email_access(
                    "user@example.com",
                    "client",
                    "refresh",
                    "INBOX",
                )

        self.assertEqual(new_refresh_token, "new-refresh")
        self.assertIsNone(rt_expires_in)
        self.assertEqual(calls[0][1], "access")
        self.assertEqual(calls[0][2], {"$select": "id", "$top": "1"})


if __name__ == "__main__":
    unittest.main()
