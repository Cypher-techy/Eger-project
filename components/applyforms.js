// Inside your form submit listener
const response = await fetch('/api/stkpush', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    phone: phoneInput.value, // Ensure this is formatted like 2547...
    fullName: nameInput.value
  })
});

const result = await response.json();

if (result.status === 'success') {
  // Show a loading spinner or message: "Check your phone for M-Pesa prompt"
  document.getElementById('loadingMessage').style.display = 'block';
  
  // Wait for the callback (optional, but good UX)
  setTimeout(() => {
     // Check status via another API call or just assume success after 30s
     alert("Please check your phone for the M-Pesa PIN prompt.");
  }, 2000);
} else {
  alert("Connection issue: " + result.message);
}