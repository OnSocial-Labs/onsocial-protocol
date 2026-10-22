SELECT post_id
FROM feed_pulse(ARRAY['alice.near']::text[], 10, 0, 'recent');
