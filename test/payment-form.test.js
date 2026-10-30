const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('grant entry requires account and does not request a fee for an unapproved application', () => {
  const landing = fs.readFileSync('public/grant.html', 'utf8');
  const script = fs.readFileSync('public/platform.js', 'utf8');
  const schema = fs.readFileSync('supabase/migrations/20261101_approved_grants.sql', 'utf8');
  assert.match(landing, /\/platform\.html#grant/);
  assert.doesNotMatch(landing, /\/api\/stkpush/);
  assert.match(script, /kazileo_submit_grant_application/);
  assert.match(script, /No grant has been approved and no fee is due/);
  assert.match(script, /result\.status !== 'approved'/);
  assert.match(schema, /a\.user_id = actor/);
  assert.match(schema, /a\.withdrawal_id IS NULL/);
  assert.match(schema, /NOT public\.kazileo_is_admin\(\)/);
  assert.match(schema, /FOR UPDATE/);
  assert.match(schema, /A verified KES 50 fee/);
});
