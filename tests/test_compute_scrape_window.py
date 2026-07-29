import unittest
from datetime import datetime, timedelta, timezone

from compute_scrape_window import compute_hours


class ComputeScrapeWindowTest(unittest.TestCase):
    def test_uses_default_when_state_is_missing(self) -> None:
        self.assertEqual(
            compute_hours(
                last_success_at=None,
                default_hours=24,
                min_hours=6,
                max_hours=48,
                buffer_hours=3,
            ),
            24,
        )

    def test_elapsed_time_plus_buffer_is_rounded_up(self) -> None:
        now = datetime(2026, 7, 10, 10, 0, tzinfo=timezone.utc)
        last_success = now - timedelta(hours=5, minutes=10)

        self.assertEqual(
            compute_hours(last_success, 24, 6, 48, 3, now=now),
            9,
        )

    def test_clamps_to_minimum(self) -> None:
        now = datetime(2026, 7, 10, 10, 0, tzinfo=timezone.utc)
        last_success = now - timedelta(minutes=30)

        self.assertEqual(
            compute_hours(last_success, 24, 6, 48, 3, now=now),
            6,
        )

    def test_clamps_to_maximum(self) -> None:
        now = datetime(2026, 7, 10, 10, 0, tzinfo=timezone.utc)
        last_success = now - timedelta(hours=80)

        self.assertEqual(
            compute_hours(last_success, 24, 6, 48, 3, now=now),
            48,
        )


if __name__ == "__main__":
    unittest.main()
