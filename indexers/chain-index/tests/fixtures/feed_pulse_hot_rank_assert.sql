SELECT post_id
FROM feed_pulse(ARRAY['alice.heat', 'carol.heat']::text[], 10, 0, 'hot');
