'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('activity management uses admin-only RPCs and creates drafts', () => {
  const sql = fs.readFileSync('supabase/migrations/20261102_activity_management.sql', 'utf8');
  const ui = fs.readFileSync('public/platform.js', 'utf8');
  assert.equal((sql.match(/NOT public\.kazileo_is_admin\(\)/g) || []).length, 2);
  assert.match(sql, /VALUES \(trim\(p_title\), trim\(p_instructions\), p_level, false\)/);
  assert.match(sql, /REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon/);
  assert.match(ui, /rpc\('kazileo_create_activity'/);
  assert.match(ui, /rpc\('kazileo_set_activity_active'/);
});
