'use strict';
const $ = id => document.getElementById(id);
let config, token, user, activeWithdrawalFee;
const message = text => { $('notice').textContent = text || ''; };
const node = (tag, text, className) => { const el = document.createElement(tag); if (text != null) el.textContent = text; if (className) el.className = className; return el; };
function sessionToken() { try { return sessionStorage.getItem('kazileo_access_token'); } catch (_) { return null; } }
function storeToken(value) { if (value) sessionStorage.setItem('kazileo_access_token', value); else sessionStorage.removeItem('kazileo_access_token'); token = value; }
async function request(path, options = {}) {
  const response = await fetch(config.url + path, {
    ...options, headers: { apikey: config.anonKey, Authorization: `Bearer ${token || config.anonKey}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  let data = null; try { data = await response.json(); } catch (_) { /* empty response */ }
  if (!response.ok) {
    if (response.status === 401 && token) { storeToken(null); showAuth(); }
    throw new Error(data?.msg || data?.message || data?.error_description || 'Request failed. Please try again.');
  }
  return data;
}
function showAuth() { $('auth-view').hidden = false; $('user-view').hidden = true; $('admin-view').hidden = true; }
function showUser() { $('auth-view').hidden = true; $('user-view').hidden = false; $('account-email').textContent = user.email || ''; if (location.hash === '#grant') $('grant').scrollIntoView({ block: 'start' }); }
function button(text, fn) { const b = node('button', text, 'secondary'); b.type = 'button'; b.addEventListener('click', async () => { b.disabled = true; message(''); try { await fn(); } catch (error) { message(error.message); } finally { b.disabled = false; } }); return b; }
function rpc(name, args = {}) { return request('/rest/v1/rpc/' + name, { method: 'POST', body: JSON.stringify(args) }); }
function empty(container, text) { if (!container.children.length) container.append(node('p', text)); }
async function refresh() {
  const [wallets, activities, submissions, withdrawals, payments, withdrawalFees, admin] = await Promise.all([
    request('/rest/v1/kazileo_wallets?select=available_kes&user_id=eq.' + encodeURIComponent(user.id)),
    request('/rest/v1/kazileo_activities?select=id,title,instructions,level&active=eq.true&order=created_at.desc'),
    request('/rest/v1/kazileo_submissions?select=id,activity_id,status,created_at&user_id=eq.' + encodeURIComponent(user.id) + '&order=created_at.desc'),
    request('/rest/v1/kazileo_withdrawals?select=id,amount_kes,status,receipt,created_at&user_id=eq.' + encodeURIComponent(user.id) + '&order=created_at.desc'),
    request('/rest/v1/kazileo_level_two_payments?select=id,status,checkout_request_id,created_at&user_id=eq.' + encodeURIComponent(user.id) + '&order=created_at.desc'),
    request('/rest/v1/kazileo_withdrawal_fees?select=id,status,phone,withdrawal_amount_kes,checkout_request_id,created_at&user_id=eq.' + encodeURIComponent(user.id) + '&order=created_at.desc'),
    rpc('kazileo_is_admin')
  ]);
  const activePayment = payments.find(p => ['initiating', 'pending', 'unlocked'].includes(p.status));
  $('unlock-form').hidden = !!activePayment;
  $('unlock-status').textContent = activePayment ? (activePayment.status === 'unlocked' ? 'Level two is unlocked for all activities.' : 'Payment is awaiting administrator verification. Do not pay again. ' + (activePayment.checkout_request_id ? 'Checkout ID: ' + activePayment.checkout_request_id : 'Contact support to review the payment status.')) : 'Level two is locked. A request will charge KES 20 if you approve it on your phone.';
  activeWithdrawalFee = withdrawalFees.find(p => ['initiating', 'pending', 'verified'].includes(p.status));
  const awaiting = activeWithdrawalFee && activeWithdrawalFee.status !== 'verified';
  $('withdraw-submit').disabled = !!awaiting;
  $('amount').readOnly = !!activeWithdrawalFee; $('phone').readOnly = !!activeWithdrawalFee;
  if (activeWithdrawalFee) { $('amount').value = activeWithdrawalFee.withdrawal_amount_kes; $('phone').value = activeWithdrawalFee.phone; }
  $('withdraw-submit').textContent = activeWithdrawalFee?.status === 'verified' ? 'Submit withdrawal request' : 'Request KES 50 payment';
  $('withdraw-fee-status').textContent = awaiting ? 'Payment awaiting administrator verification. Do not pay again. ' + (activeWithdrawalFee.checkout_request_id ? 'Checkout ID: ' + activeWithdrawalFee.checkout_request_id : 'Contact support to reconcile its status.') : activeWithdrawalFee ? 'The KES 50 fee was verified for this amount and number. Submit the withdrawal request separately.' : 'Request a separate KES 50 STK payment for the amount and number entered below.';
  $('balance').textContent = 'KES ' + Number(wallets[0]?.available_kes || 0).toLocaleString('en-KE');
  const activityList = $('activities'); activityList.replaceChildren();
  activities.forEach(a => {
    const row = node('div', null, 'platform-item'); row.append(node('strong', a.title), node('small', `Level ${a.level}`), node('p', a.instructions));
    const previous = submissions.find(s => s.activity_id === a.id);
    if (previous) row.append(node('small', 'Submitted: ' + previous.status));
    else {
      const form = node('form'); const label = node('label', 'Your answer'); const answer = node('textarea');
      answer.required = true; answer.maxLength = 10000; label.append(answer); const submit = node('button', 'Submit for review', 'btn'); submit.type = 'submit';
      form.append(label, submit); form.addEventListener('submit', async e => { e.preventDefault(); submit.disabled = true; message(''); try { await rpc('kazileo_submit', { p_activity_id: a.id, p_answer: answer.value.trim() }); await refresh(); message('Submission sent for review.'); } catch (err) { message(err.message); submit.disabled = false; } }); row.append(form);
    }
    activityList.append(row);
  });
  empty(activityList, 'No activities are available yet.');
  const list = $('submissions'); list.replaceChildren(); submissions.forEach(s => { const row = node('div', null, 'platform-item'); const activity = activities.find(a => a.id === s.activity_id); row.append(node('strong', activity?.title || 'Activity'), node('small', `Status: ${s.status}`)); list.append(row); }); empty(list, 'No submissions yet.');
  const withdrawList = $('withdrawals'); withdrawList.replaceChildren(); withdrawals.forEach(w => { const row = node('div', null, 'platform-item'); row.append(node('strong', `KES ${w.amount_kes} · ${w.status}`), node('small', w.receipt ? `Receipt: ${w.receipt}` : 'No receipt recorded yet.')); withdrawList.append(row); }); empty(withdrawList, 'No withdrawal requests yet.');
  $('admin-view').hidden = !admin;
  if (admin) await refreshAdmin();
}
async function refreshAdmin() {
  const [pending, withdrawals, unlocks, fees, grantApplications] = await Promise.all([
    request('/rest/v1/kazileo_submissions?select=id,user_id,activity_id,answer,created_at&status=eq.pending&order=created_at.asc'),
    request('/rest/v1/kazileo_withdrawals?select=id,user_id,phone,amount_kes,status,receipt&order=created_at.desc'),
    request('/rest/v1/kazileo_level_two_payments?select=id,user_id,phone,amount_kes,status,checkout_request_id,created_at&status=in.(initiating,pending)&order=created_at.asc'),
    request('/rest/v1/kazileo_withdrawal_fees?select=id,user_id,phone,amount_kes,withdrawal_amount_kes,status,checkout_request_id,created_at&status=in.(initiating,pending)&order=created_at.asc'),
    request('/rest/v1/kazileo_grant_applications?select=id,user_id,full_name,reg_number,phone,created_at&status=eq.pending&order=created_at.asc')
  ]);
  const grantList = $('admin-grant-applications'); grantList.replaceChildren();
  grantApplications.forEach(application => {
    const row = node('div', null, 'platform-item');
    row.append(node('strong', application.full_name), node('small', `Account ${application.user_id} · Registration ${application.reg_number} · Phone ${application.phone}`));
    row.append(button('Approve funded grant', async () => {
      const value = prompt('Enter the approved, funded grant amount in KES (minimum 1,200):');
      if (value === null) return;
      const amount = Number(value);
      if (!Number.isSafeInteger(amount) || amount < 1200 || amount > 10000000) throw new Error('Enter a valid whole-shilling grant amount.');
      if (!confirm(`Confirm that this applicant is approved and KES ${amount} is funded and available?`)) return;
      await rpc('kazileo_review_grant_application', { p_id: application.id, p_approve: true, p_amount: amount }); await refresh();
    }), button('Reject application', async () => {
      if (!confirm('Reject this grant application?')) return;
      await rpc('kazileo_review_grant_application', { p_id: application.id, p_approve: false, p_amount: null }); await refresh();
    }));
    grantList.append(row);
  }); empty(grantList, 'No pending grant applications.');
  const unlockList = $('admin-unlocks'); unlockList.replaceChildren();
  unlocks.forEach(payment => {
    const row = node('div', null, 'platform-item');
    row.append(node('strong', `KES ${payment.amount_kes} · ${payment.status}`), node('small', `User ${payment.user_id} · Phone ${payment.phone} · Checkout ${payment.checkout_request_id || 'unavailable'} · ${payment.created_at}`));
    if (payment.checkout_request_id) row.append(button('Verify and unlock', async () => {
      const receipt = prompt('After independently verifying this payment with Safaricom, enter the verified M-Pesa receipt:');
      if (!receipt || !receipt.trim()) return;
      if (!confirm('Confirm you verified this KES 20 payment with Safaricom?')) return;
      await rpc('kazileo_review_level_two', { p_id: payment.id, p_approve: true, p_receipt: receipt.trim() }); await refresh();
    }));
    row.append(button('Mark unsuccessful', async () => {
      if (!confirm('Only mark unsuccessful after checking with Safaricom that no payment was made. Continue?')) return;
      await rpc('kazileo_review_level_two', { p_id: payment.id, p_approve: false, p_receipt: null }); await refresh();
    }));
    unlockList.append(row);
  }); empty(unlockList, 'No level-two payments awaiting review.');
  const feesList = $('admin-withdraw-fees'); feesList.replaceChildren();
  fees.forEach(fee => {
    const row = node('div', null, 'platform-item');
    row.append(node('strong', `KES ${fee.amount_kes} fee · ${fee.status}`), node('small', `User ${fee.user_id} · Phone ${fee.phone} · Withdrawal KES ${fee.withdrawal_amount_kes} · Checkout ${fee.checkout_request_id || 'unavailable'} · ${fee.created_at}`));
    if (fee.checkout_request_id) row.append(button('Verify fee', async () => {
      const receipt = prompt('After independently verifying this KES 50 payment with Safaricom, enter the verified M-Pesa receipt:');
      if (!receipt || !receipt.trim()) return;
      if (!confirm('Confirm you independently verified the KES 50 fee, phone and checkout ID with Safaricom?')) return;
      await rpc('kazileo_review_withdrawal_fee', { p_id: fee.id, p_approve: true, p_receipt: receipt.trim() }); await refresh();
    }));
    row.append(button('Mark unsuccessful', async () => {
      if (!confirm('Only mark unsuccessful after checking with Safaricom that no payment was made. Continue?')) return;
      await rpc('kazileo_review_withdrawal_fee', { p_id: fee.id, p_approve: false, p_receipt: null }); await refresh();
    })); feesList.append(row);
  }); empty(feesList, 'No withdrawal fees awaiting review.');
  const submissions = $('admin-submissions'); submissions.replaceChildren();
  pending.forEach(s => { const row = node('div', null, 'platform-item'); row.append(node('strong', `Activity ${s.activity_id}`), node('small', `User ${s.user_id}`), node('p', s.answer));
    for (const approve of [true, false]) row.append(button(approve ? 'Approve · KES 100' : 'Reject', async () => { if (!confirm(approve ? 'Approve and credit KES 100?' : 'Reject this submission?')) return; await rpc('kazileo_review_submission', { p_id: s.id, p_approve: approve }); await refresh(); })); submissions.append(row);
  }); empty(submissions, 'No pending submissions.');
  const list = $('admin-withdrawals'); list.replaceChildren();
  withdrawals.forEach(w => { const row = node('div', null, 'platform-item'); row.append(node('strong', `KES ${w.amount_kes} · ${w.status}`), node('small', `User ${w.user_id} · Phone ${w.phone}`));
    if (w.receipt) row.append(node('small', `Receipt: ${w.receipt}`));
    if (w.status === 'pending') {
      row.append(button('Claim for manual payment', async () => { if (!confirm('Claim this request before sending money manually?')) return; await rpc('kazileo_claim_withdrawal', { p_id: w.id }); await refresh(); }), button('Reject and refund', async () => { if (!confirm('Reject and refund this pending request?')) return; await rpc('kazileo_reject_withdrawal', { p_id: w.id }); await refresh(); }));
    } else if (w.status === 'paying') {
      row.append(button('Record payment receipt', async () => { const receipt = prompt('Enter the verified M-Pesa receipt after paying manually:'); if (!receipt || !receipt.trim()) return; await rpc('kazileo_finish_withdrawal', { p_id: w.id, p_receipt: receipt.trim() }); await refresh(); }));
    }
    list.append(row);
  }); empty(list, 'No withdrawals.');
}
$('auth-form').addEventListener('submit', async e => { e.preventDefault(); message(''); try { const result = await request('/auth/v1/token?grant_type=password', { method: 'POST', body: JSON.stringify({ email: $('email').value.trim(), password: $('password').value }) }); storeToken(result.access_token); user = result.user; $('password').value = ''; showUser(); await refresh(); } catch (error) { message(error.message); } });
$('signup').addEventListener('click', async () => { message(''); if (!$('auth-form').reportValidity()) return; try { const result = await request('/auth/v1/signup', { method: 'POST', body: JSON.stringify({ email: $('email').value.trim(), password: $('password').value }) }); $('password').value = ''; if (result.access_token && result.user) { storeToken(result.access_token); user = result.user; showUser(); await refresh(); } else message('Check your email to confirm your account, then sign in.'); } catch (error) { message(error.message); } });
$('logout').addEventListener('click', async () => { try { await request('/auth/v1/logout', { method: 'POST' }); } catch (_) { /* clear local session even if server is unreachable */ } storeToken(null); user = null; showAuth(); message('Signed out.'); });
$('grant-form').addEventListener('submit', async e => {
  e.preventDefault(); const submit = e.target.querySelector('button'); submit.disabled = true; message('');
  $('grant-status').textContent = 'Checking your application…';
  try {
    const phone = $('grant-phone').value.trim();
    const result = await rpc('kazileo_submit_grant_application', { p_full_name: $('grant-name').value.trim(), p_reg_number: $('grant-reg').value.trim(), p_phone: phone });
    if (result.status !== 'approved') { $('grant-status').textContent = 'Application submitted for administrator review. No grant has been approved and no fee is due.'; return; }
    await refresh();
    if (activeWithdrawalFee && (activeWithdrawalFee.phone !== phone || Number(activeWithdrawalFee.withdrawal_amount_kes) !== Number(result.amount_kes))) {
      $('grant-status').textContent = 'An approved grant is available, but an existing withdrawal fee is linked to different details. Contact support before paying again.'; return;
    }
    $('amount').value = result.amount_kes; $('phone').value = phone;
    $('grant-status').textContent = `An administrator approved a KES ${result.amount_kes} grant for this account. Review the separate KES 50 withdrawal fee below; payment is not automatic and does not guarantee payout.`;
    $('withdraw-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } catch (error) { $('grant-status').textContent = error.message || 'Unable to check your application.'; }
  finally { submit.disabled = false; }
});
$('unlock-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (!confirm('Request an STK prompt to pay KES 20 for a global level-two unlock?')) return;
  const submit = e.target.querySelector('button'); submit.disabled = true; message('');
  try {
    const response = await fetch('/api/level-unlock', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ phone: $('unlock-phone').value.trim() }) });
    let data = {}; try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(data.message || 'Payment status is uncertain. Check your phone and contact support before retrying.');
    await refresh(); message(data.message);
  } catch (error) { message(error.message); try { await refresh(); } catch (_) {} }
  finally { submit.disabled = false; }
});
$('withdraw-form').addEventListener('submit', async e => {
  e.preventDefault(); const submit = $('withdraw-submit'); submit.disabled = true; message('');
  try {
    if (activeWithdrawalFee?.status === 'verified') {
      await rpc('kazileo_request_withdrawal', { p_amount: Number($('amount').value), p_phone: $('phone').value.trim() });
      e.target.reset(); await refresh(); message('Withdrawal request submitted for manual review.');
    } else if (!activeWithdrawalFee) {
      if (!confirm('Request a separate KES 50 payment before submitting this withdrawal? The payment does not guarantee withdrawal approval or verify phone ownership.')) return;
      const response = await fetch('/api/withdrawal-fee', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ phone: $('phone').value.trim(), withdrawalAmount: Number($('amount').value) }) });
      let data = {}; try { data = await response.json(); } catch (_) {}
      if (!response.ok) throw new Error(data.message || 'Payment status is uncertain. Check your phone and contact support before retrying.');
      await refresh(); message(data.message);
    }
  } catch (error) { message(error.message); try { await refresh(); } catch (_) {} }
  finally { submit.disabled = !!(activeWithdrawalFee && activeWithdrawalFee.status !== 'verified'); }
});
(async function init() { try { const res = await fetch('/api/kazileo-config'); const data = await res.json(); if (!res.ok) throw new Error(data.message || 'Configuration unavailable.'); config = data; token = sessionToken(); if (token) { user = await request('/auth/v1/user'); showUser(); await refresh(); } } catch (err) { message(err.message); } })();
