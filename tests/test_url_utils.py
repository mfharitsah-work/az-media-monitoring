import unittest

from news_pipeline.url_utils import canonicalize_article_url, make_article_id


class UrlCanonicalizationTest(unittest.TestCase):
    def test_removes_amp_path_and_tracking_query(self) -> None:
        url = "https://www.kompas.com/health/read/2026/07/01/foo/amp?utm_source=x&fbclid=abc"

        self.assertEqual(
            canonicalize_article_url(url),
            "https://www.kompas.com/health/read/2026/07/01/foo",
        )

    def test_normalizes_amp_and_mobile_hosts(self) -> None:
        self.assertEqual(
            canonicalize_article_url("https://amp.kompas.com/news/read/123/foo"),
            "https://www.kompas.com/news/read/123/foo",
        )
        self.assertEqual(
            canonicalize_article_url("https://m.detik.com/news/berita/foo"),
            "https://www.detik.com/news/berita/foo",
        )

    def test_drops_page_query_so_page_all_is_same_article(self) -> None:
        clean = "https://www.tempo.co/politik/foo"
        paged = "https://www.tempo.co/politik/foo?page=all&utm_medium=social"

        self.assertEqual(canonicalize_article_url(paged), clean)
        self.assertEqual(make_article_id(clean), make_article_id(paged))

    def test_normalizes_sindonews_newsread_path(self) -> None:
        self.assertEqual(
            canonicalize_article_url("https://nasional.sindonews.com/newsread/123/foo"),
            "https://nasional.sindonews.com/read/123/foo",
        )


if __name__ == "__main__":
    unittest.main()
