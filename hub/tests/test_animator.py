import asyncio

from app import animator


def test_start_cycles_through_all_scenes_in_order_and_stop_cancels_it(monkeypatch):
    calls = []

    def fake_activate_scene(host, scene_id, duration_ms=0):
        calls.append((scene_id, duration_ms))
        return True, ""

    monkeypatch.setattr(animator, "activate_scene", fake_activate_scene)

    async def scenario():
        animator.start(1, "nyc", ["scene-a", "scene-b", "scene-c"], interval_seconds=0)
        assert animator.is_running(1)

        # activate_scene runs on a worker thread (asyncio.to_thread); a
        # short real sleep gives it room to actually complete a few loop
        # iterations rather than assuming instant completion.
        await asyncio.sleep(0.3)

        animator.stop(1)
        assert not animator.is_running(1)

    asyncio.run(scenario())

    assert len(calls) >= 4
    assert [c[0] for c in calls[:4]] == ["scene-a", "scene-b", "scene-c", "scene-a"]
    # interval_seconds=0 -> the floor kicks in, not zero-length fades.
    assert calls[0][1] == 200


def test_fade_duration_spans_almost_the_whole_interval():
    assert animator._fade_duration_ms(0) == 200
    assert animator._fade_duration_ms(2) == 1800
    assert animator._fade_duration_ms(30) == 29800


def test_start_is_idempotent_for_an_already_running_animation(monkeypatch):
    monkeypatch.setattr(animator, "activate_scene", lambda host, scene_id, duration_ms=0: (True, ""))

    async def scenario():
        animator.start(2, "nyc", ["scene-a", "scene-b"], interval_seconds=100)
        first_task = animator._tasks[2]

        animator.start(2, "nyc", ["scene-a", "scene-b"], interval_seconds=100)

        assert animator._tasks[2] is first_task
        animator.stop(2)

    asyncio.run(scenario())


def test_stop_on_an_animation_that_isnt_running_is_a_no_op():
    animator.stop(999)
    assert not animator.is_running(999)
