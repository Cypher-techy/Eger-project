const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('withdrawal minimum is consistent in UI, fresh schema and existing-install migration', () => {
  const html = fs.readFileSync('public/platform.html', 'utf8');
  const home = fs.readFileSync('public/index.html', 'utf8');
  const schema = fs.readFileSync('supabase/kazileo-ledger.sql', 'utf8');
  const migration = fs.readFileSync('supabase/migrations/20261030_withdrawal_minimum_1200.sql', 'utf8');
  assert.match(html, /Minimum withdrawal KES 1,200/);
  assert.match(html, /min="1200"/);
  assert.match(home, /withdrawal from KES 1,200/);
  for (const sql of [schema, migration]) {
    assert.match(sql, /CHECK \(amount_kes >= 1200\)/);
    assert.match(sql, /p_amount < 1200/);
    assert.match(sql, /available_kes >= p_amount/);
    assert.match(sql, /kazileo_one_open_withdrawal|CREATE OR REPLACE FUNCTION public\.kazileo_request_withdrawal/);
  }
});
