'use strict';
// Category tiles lead to the account page. Available activities come from Supabase there.
const activities = [
  { icon: '🧠', name: 'Braintest' },
  { icon: '🏠', name: 'House Review' },
  { icon: '📋', name: 'Surveys' },
  { icon: '💬', name: 'Chat Moderator' },
  { icon: '📚', name: 'Online Tutor' }
];
const cards = document.getElementById('job-cards');
activities.forEach(activity => {
  const card = document.createElement('a');
  card.className = 'job-card';
  card.href = '/platform.html';
  card.setAttribute('aria-label', `Sign in to see available ${activity.name} activities`);
  const icon = document.createElement('div'); icon.className = 'job-icon'; icon.textContent = activity.icon;
  const title = document.createElement('h3'); title.textContent = activity.name;
  card.append(icon, title); cards.append(card);
  if (typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    card.addEventListener('pointermove', event => {
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      card.style.transform = `perspective(900px) rotateX(${-y * 7}deg) rotateY(${x * 7}deg) translateY(-3px)`;
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  }
});
