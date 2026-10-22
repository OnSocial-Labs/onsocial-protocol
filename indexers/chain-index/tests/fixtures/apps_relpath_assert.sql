SELECT id || '=' || COALESCE(app_relpath, '<null>')
FROM data_updates
WHERE id LIKE 'apps-relpath-fixture-%'
ORDER BY id;
