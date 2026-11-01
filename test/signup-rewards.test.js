'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('signup reward migration records fixed rewards once per account and referral', () => {
  const sql = fs.readFileSync('supabase/migrations/20261102_signup_rewards.sql', 'utf8');
  const ui = fs.readFileSync('public/platform.js', 'utf8');
  assert.match(sql, /AFTER INSERT ON auth\.users/);
  assert.match(sql, /NEW\.id, 1000, 'welcome_bonus'/);
  assert.match(sql, /referrer, 100, 'referral_reward', NEW\.id/);
  assert.match(sql, /UNIQUE INDEX kazileo_one_welcome_bonus/);
  assert.match(sql, /UNIQUE INDEX kazileo_one_referral_reward/);
  assert.match(sql, /SECURITY DEFINER SET search_path = ''/);
  assert.match(ui, /kazileo_referral_code/);
  assert.match(ui, /kazileo_my_referral_code/);
});
