from dishify.rate_limit import RateLimiter


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def test_per_minute_limit_and_reset():
    clock = Clock()
    limiter = RateLimiter(per_minute=3, per_day=100, clock=clock)
    assert all(limiter.hit("a").allowed for _ in range(3))

    blocked = limiter.hit("a")
    assert not blocked.allowed
    assert 1 <= blocked.retry_after <= 60

    clock.now += 61
    assert limiter.hit("a").allowed


def test_users_are_counted_separately():
    limiter = RateLimiter(per_minute=1, per_day=100, clock=Clock())
    assert limiter.hit("a").allowed
    assert not limiter.hit("a").allowed
    assert limiter.hit("b").allowed


def test_daily_limit():
    clock = Clock()
    limiter = RateLimiter(per_minute=100, per_day=2, clock=clock)
    assert limiter.hit("a").allowed
    clock.now += 120
    assert limiter.hit("a").allowed
    clock.now += 120
    result = limiter.hit("a")
    assert not result.allowed
    assert result.retry_after > 60 * 60  # hours, not seconds

    clock.now += 24 * 60 * 60
    assert limiter.hit("a").allowed


def test_blocked_requests_do_not_count():
    clock = Clock()
    limiter = RateLimiter(per_minute=1, per_day=100, clock=clock)
    limiter.hit("a")
    for _ in range(5):
        limiter.hit("a")  # blocked
    clock.now += 61
    assert limiter.hit("a").allowed
